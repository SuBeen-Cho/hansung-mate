import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StudentApp } from "./journey/StudentApp";

import { registerPwa } from "./register-pwa";

registerPwa();

const root = document.getElementById("root");
if (!root) throw new Error("root 요소를 찾을 수 없습니다.");

createRoot(root).render(
  <StrictMode>
    <StudentApp />
  </StrictMode>,
);
