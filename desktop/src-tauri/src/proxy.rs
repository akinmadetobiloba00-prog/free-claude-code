// SPDX-License-Identifier: AGPL-3.0-only
//! Same-origin bridge. In release builds the window loads the UI from this tiny loopback
//! server, which also forwards /admin/* and /health to fcc-server. The webview is then
//! same-origin with the API, so an unmodified FCC install (whose Admin API only trusts
//! loopback origins) works without any server change. SSE responses are streamed through.

use std::sync::atomic::{AtomicU16, Ordering};

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Router;
use tauri::Manager;

/// Port of the local fcc-server that API calls are forwarded to.
pub static FCC_PORT: AtomicU16 = AtomicU16::new(8082);

#[derive(Clone)]
struct Ctx {
    app: tauri::AppHandle,
    client: reqwest::Client,
}

/// Start the bridge on 127.0.0.1:18082 (stable origin keeps saved settings), or a free port.
pub async fn serve(app: tauri::AppHandle) -> std::io::Result<u16> {
    let listener = match tokio::net::TcpListener::bind("127.0.0.1:18082").await {
        Ok(l) => l,
        Err(_) => tokio::net::TcpListener::bind("127.0.0.1:0").await?,
    };
    let port = listener.local_addr()?.port();
    let client = reqwest::Client::builder().no_proxy().build().map_err(std::io::Error::other)?;
    let router = Router::new().fallback(handle).with_state(Ctx { app, client });
    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });
    Ok(port)
}

async fn handle(State(c): State<Ctx>, req: Request) -> Response {
    let path = req.uri().path().to_string();
    if path.starts_with("/admin/") || path == "/admin" || path == "/health" {
        return forward(&c, req).await;
    }
    asset(&c, &path)
}

fn asset(c: &Ctx, path: &str) -> Response {
    let wanted = if path == "/" { "index.html".to_string() } else { path.trim_start_matches('/').to_string() };
    let resolver = c.app.asset_resolver();
    // Unknown paths fall back to index.html (single-page app).
    let Some(a) = resolver.get(wanted).or_else(|| resolver.get("index.html".into())) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let mut b = Response::builder().header(header::CONTENT_TYPE, a.mime_type.as_str());
    if let Some(csp) = a.csp_header.as_deref() {
        b = b.header("content-security-policy", csp);
    }
    b.body(Body::from(a.bytes)).unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

async fn forward(c: &Ctx, req: Request) -> Response {
    let port = FCC_PORT.load(Ordering::Relaxed);
    let pq = req.uri().path_and_query().map(|x| x.as_str().to_string()).unwrap_or_else(|| "/".into());
    let url = format!("http://127.0.0.1:{port}{pq}");
    let Ok(method) = reqwest::Method::from_bytes(req.method().as_str().as_bytes()) else {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    };
    let content_type = req.headers().get(header::CONTENT_TYPE).map(|v| v.as_bytes().to_vec());
    let accept = req.headers().get(header::ACCEPT).map(|v| v.as_bytes().to_vec());
    let body = match axum::body::to_bytes(req.into_body(), 32 * 1024 * 1024).await {
        Ok(b) => b,
        Err(_) => return StatusCode::PAYLOAD_TOO_LARGE.into_response(),
    };
    // No Origin header is sent, and Host is 127.0.0.1, so FCC's loopback-only checks pass.
    let mut rb = c.client.request(method, url).body(body.to_vec());
    if let Some(ct) = content_type {
        rb = rb.header("content-type", ct);
    }
    if let Some(a) = accept {
        rb = rb.header("accept", a);
    }
    match rb.send().await {
        Ok(r) => {
            let mut b = Response::builder().status(r.status().as_u16());
            for (k, v) in r.headers() {
                let name = k.as_str();
                if matches!(name, "content-length" | "transfer-encoding" | "connection" | "keep-alive") {
                    continue;
                }
                b = b.header(name, v.as_bytes());
            }
            b.body(Body::from_stream(r.bytes_stream()))
                .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
        }
        Err(_) => (StatusCode::BAD_GATEWAY, "{\"detail\":\"FCC server is not reachable\"}").into_response(),
    }
}
