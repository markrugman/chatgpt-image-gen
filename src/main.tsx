import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BrowserGate } from "./BrowserGate";
import { isDesktop } from "./api";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isDesktop ? <App /> : <BrowserGate><App /></BrowserGate>}
  </React.StrictMode>,
);
