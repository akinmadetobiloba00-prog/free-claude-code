// SPDX-License-Identifier: AGPL-3.0-only
// FCC Desk - desktop app for Free Claude Code. Not affiliated with Anthropic.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyTheme, loadTheme } from "./lib/theme";
import "./index.css";

applyTheme(loadTheme());
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
