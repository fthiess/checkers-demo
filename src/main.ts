import "./style.css";
import "./ui/board.css";
import { BLACK_KING, BLACK_MAN, createOpeningPosition, WHITE_KING } from "./engine/board.ts";
import { describeLaunchContext, launchContextFor } from "./launch-context.ts";
import { computeBoardLayout } from "./ui/board.ts";

const status = document.querySelector<HTMLParagraphElement>("#status");

if (status) {
  status.textContent = describeLaunchContext(launchContextFor(window.location.protocol));
}

function renderBoard(container: HTMLElement): void {
  const layout = computeBoardLayout(createOpeningPosition(), "black");
  const board = document.createElement("div");
  board.className = "board";

  for (const square of layout.squares) {
    const el = document.createElement("div");
    el.className = `square ${square.dark ? "square--dark" : "square--light"}`;
    el.style.gridRow = String(square.row + 1);
    el.style.gridColumn = String(square.col + 1);
    board.appendChild(el);
  }

  for (const piece of layout.pieces) {
    const el = document.createElement("div");
    const isKing = piece.piece === BLACK_KING || piece.piece === WHITE_KING;
    const isBlack = piece.piece === BLACK_MAN || piece.piece === BLACK_KING;
    el.className = `piece ${isBlack ? "piece--black" : "piece--white"} ${isKing ? "piece--king" : ""}`;
    el.style.transform = `translate(${piece.col * 100}%, ${piece.row * 100}%)`;
    board.appendChild(el);
  }

  container.appendChild(board);
}

const boardRoot = document.querySelector<HTMLDivElement>("#board-root");
if (boardRoot) {
  renderBoard(boardRoot);
}
