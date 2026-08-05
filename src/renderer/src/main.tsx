import ReactDOM from "react-dom/client";
import App from "./App.js";
import "./index.css";

// No StrictMode: its double-mounted effects would spawn duplicate ptys.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
