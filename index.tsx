import React from "react";
import { createRoot } from "react-dom/client";
import AffinityCore from "./affinity_core_unified_v3";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<AffinityCore />);
}
