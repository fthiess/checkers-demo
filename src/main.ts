import "./style.css";
import { describeLaunchContext, launchContextFor } from "./launch-context.ts";

const status = document.querySelector<HTMLParagraphElement>("#status");

if (status) {
  status.textContent = describeLaunchContext(launchContextFor(window.location.protocol));
}
