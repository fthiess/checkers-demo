import "./style.css";
import "./ui/board.css";
import {
  BLACK_KING,
  BLACK_MAN,
  createOpeningPosition,
  type Side,
  type SquareIndex,
  WHITE_KING,
} from "./engine/board.ts";
import { describeLaunchContext, launchContextFor } from "./launch-context.ts";
import { computeBoardLayout, squareAtOrientedCoordinates } from "./ui/board.ts";
import { attemptMove, type InputState, selectSquare } from "./ui/input.ts";

const status = document.querySelector<HTMLParagraphElement>("#status");
if (status) {
  status.textContent = describeLaunchContext(launchContextFor(window.location.protocol));
}

const boardRoot = document.querySelector<HTMLDivElement>("#board-root");

// Fixed until Phase 5 adds real player/side selection.
const VIEWING_SIDE: Side = "black";

let state: InputState = { position: createOpeningPosition(), selected: null };

// Piece elements handle both "tap to select" and "drag to move" via pointer events, and
// deliberately have no separate click listener: a plain click still fires pointerdown then
// pointerup, and a redundant click handler alongside that would re-toggle the selection
// selectSquare just made, undoing it. Empty squares only ever need a click listener, since
// a legal destination is always an empty square -- a piece can never itself be one.
let dragOrigin: SquareIndex | null = null;
let dragEl: HTMLElement | null = null;
let boardElRef: HTMLElement | null = null;

function handleSquareClick(square: SquareIndex): void {
  state = attemptMove(state, square);
  render();
}

function handlePiecePointerDown(event: PointerEvent, square: SquareIndex): void {
  state = selectSquare(state, square);
  dragOrigin = square;
  dragEl = event.currentTarget as HTMLElement;
  dragEl.setPointerCapture(event.pointerId);
  dragEl.style.zIndex = "10";
  // No render() here: it would rebuild the board and discard the very element that just
  // captured the pointer, silently ending the drag. The selection becomes visible, and the
  // dragged piece is repositioned, once the gesture completes in handleBoardPointerUp.
}

function handleBoardPointerMove(event: PointerEvent): void {
  if (!dragEl || !boardElRef) return;
  const rect = boardElRef.getBoundingClientRect();
  const cell = rect.width / 8;
  dragEl.style.transform = `translate(${event.clientX - rect.left - cell / 2}px, ${event.clientY - rect.top - cell / 2}px)`;
}

function handleBoardPointerUp(event: PointerEvent): void {
  if (dragOrigin === null || !boardElRef) return;
  const rect = boardElRef.getBoundingClientRect();
  const col = Math.floor(((event.clientX - rect.left) / rect.width) * 8);
  const row = Math.floor(((event.clientY - rect.top) / rect.height) * 8);
  const target = squareAtOrientedCoordinates(row, col, VIEWING_SIDE);

  dragOrigin = null;
  dragEl = null;

  // A release with no real movement lands back on the origin square; attemptMove finds no
  // move from a square to itself and leaves state untouched, so this doubles as the "just
  // tapped to select, didn't drag" case without any extra handling.
  if (target !== undefined) {
    state = attemptMove(state, target);
  }
  render();
}

function handleBoardPointerCancel(): void {
  dragOrigin = null;
  dragEl = null;
  render();
}

function render(): void {
  if (!boardRoot) return;
  boardRoot.replaceChildren();

  const layout = computeBoardLayout(state.position, VIEWING_SIDE);
  const board = document.createElement("div");
  board.className = "board";
  boardElRef = board;

  for (const square of layout.squares) {
    const el = document.createElement("div");
    el.className = `square ${square.dark ? "square--dark" : "square--light"}`;
    el.style.gridRow = String(square.row + 1);
    el.style.gridColumn = String(square.col + 1);
    const index = squareAtOrientedCoordinates(square.row, square.col, VIEWING_SIDE);
    if (index !== undefined) {
      el.addEventListener("click", () => handleSquareClick(index));
    }
    board.appendChild(el);
  }

  for (const piece of layout.pieces) {
    const index = squareAtOrientedCoordinates(piece.row, piece.col, VIEWING_SIDE);
    const el = document.createElement("div");
    const isKing = piece.piece === BLACK_KING || piece.piece === WHITE_KING;
    const isBlack = piece.piece === BLACK_MAN || piece.piece === BLACK_KING;
    const isSelected = index !== undefined && index === state.selected;
    el.className = [
      "piece",
      isBlack ? "piece--black" : "piece--white",
      isKing ? "piece--king" : "",
      isSelected ? "piece--selected" : "",
    ]
      .filter(Boolean)
      .join(" ");
    el.style.transform = `translate(${piece.col * 100}%, ${piece.row * 100}%)`;
    if (index !== undefined) {
      el.addEventListener("pointerdown", (event) => handlePiecePointerDown(event, index));
    }
    board.appendChild(el);
  }

  board.addEventListener("pointermove", handleBoardPointerMove);
  board.addEventListener("pointerup", handleBoardPointerUp);
  board.addEventListener("pointercancel", handleBoardPointerCancel);

  boardRoot.appendChild(board);
}

render();
