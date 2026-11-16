import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  ScatterController,
  Title,
  Tooltip,
} from "chart.js";
import App from "./App";
import "./styles.css";

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  ScatterController,
  Title,
  Tooltip,
);
Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
