import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DocsLayout } from "./components/DocsLayout";
import { DocRoutePage } from "./pages/DocRoutePage";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<DocsLayout />}>
          <Route index element={<DocRoutePage />} />
          <Route path="*" element={<DocRoutePage />} />
          <Route path="404" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
