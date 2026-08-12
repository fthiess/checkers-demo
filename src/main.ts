import "./style.css";
import "./ui/board.css";
import { mountConnectionPanel } from "./connection-panel.ts";
import {
  BLACK_KING,
  BLACK_MAN,
  EMPTY,
  type Side,
  type SquareIndex,
  WHITE_KING,
} from "./engine/board.ts";
import { createSession } from "./game/session.ts";
import { describeLaunchContext, launchContextFor } from "./launch-context.ts";
import { moveAnnouncement } from "./ui/announce.ts";
import {
  computeBoardLayout,
  orientSquare,
  squareAtOrientedCoordinates,
  squareLabel,
} from "./ui/board.ts";
import {
  clearSelection,
  findMove,
  type InputState,
  legalDestinations,
  selectSquare,
} from "./ui/input.ts";

const status = document.querySelector<HTMLParagraphElement>("#status");
if (status) {
  status.textContent = describeLaunchContext(launchContextFor(window.location.protocol));
}

const boardRoot = document.querySelector<HTMLDivElement>("#board-root");

// Queried once and never rebuilt: render() replaces the board's whole subtree on every
// interaction, and a live region that is itself replaced between the text being set and the
// screen reader reading it announces nothing (R-48). It lives outside #board-root for the
// same reason.
const announcer = document.querySelector<HTMLParagraphElement>("#announcer");

function announce(text: string): void {
  if (announcer) {
    announcer.textContent = text;
  }
}

// Fixed until Phase 5 adds real player/side selection.
const VIEWING_SIDE: Side = "black";

// The session owns the position; this holds only what the interface adds on top of it — the
// selection. Both players' boards move because the session moves them, whichever side the
// move came from.
const session = createSession();

let state: InputState = { position: session.position(), selected: null };

// Roving tabindex (R-46): exactly one square is ever tabbable at a time; arrow keys move
// which one. Separate from state.selected -- moving keyboard focus around the board never
// by itself picks up a piece.
let focusedSquare: SquareIndex = 0;

// Piece elements handle both "tap to select" and "drag to move" via pointer events, and
// deliberately have no separate click listener: a plain click still fires pointerdown then
// pointerup, and a redundant click handler alongside that would re-toggle the selection
// selectSquare just made, undoing it. Empty squares only ever need a click listener, since
// a legal destination is always an empty square -- a piece can never itself be one.
let dragOrigin: SquareIndex | null = null;
let dragEl: HTMLElement | null = null;
let boardElRef: HTMLElement | null = null;

// Drops an in-progress drag without rendering. The pointerup and pointercancel handlers both
// bail when dragOrigin is null, so clearing it is what makes a gesture abandoned here a no-op
// when the player finally lifts their finger, rather than a move.
function abandonDrag(): void {
  if (dragEl) {
    dragEl.style.zIndex = "";
  }
  dragOrigin = null;
  dragEl = null;
}

// Every input style commits its move through here, so the announcement can no more disagree
// between them than the move itself can -- the same reason findMove is shared (R-13).
// Returns whether a legal move was found and applied.
function commitMove(destination: SquareIndex): boolean {
  const move = findMove(state, destination);
  if (!move) return false;

  const before = state.position;
  session.play(move);
  state = { position: session.position(), selected: null };
  announce(moveAnnouncement(before, move, state.position));
  return true;
}

// An opponent's move has to reach the board and the live region by the same route a local one
// does, or the two drift: R-48 does not care which end of the connection a move came from.
//
// It abandons any gesture in flight first. Until this task, render() only ever ran because of
// something the local player did, so it could assume no drag was open and that focus belonged
// to the board. A move arriving from the network breaks both assumptions: rebuilding the
// board detaches the element the pointer is captured to, which kills the drag silently, and
// leaving dragOrigin set would let the eventual pointerup commit a move against a board that
// changed underneath the player mid-gesture.
session.onOpponentMove(({ move, before, after }) => {
  abandonDrag();
  state = { position: after, selected: null };
  announce(moveAnnouncement(before, move, after));
  render();
});

function activateSquare(square: SquareIndex): void {
  focusedSquare = square;
  if (state.selected !== null && state.selected !== square && commitMove(square)) {
    render();
    return;
  }
  state = selectSquare(state, square);
  render();
}

function handleSquareClick(square: SquareIndex): void {
  activateSquare(square);
}

function handlePiecePointerDown(event: PointerEvent, square: SquareIndex): void {
  focusedSquare = square;
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

  // A release with no real movement lands back on the origin square; there is no legal move
  // from a square to itself, so commitMove finds nothing and leaves state untouched -- which
  // doubles as the "just tapped to select, didn't drag" case without any extra handling.
  if (target !== undefined) {
    commitMove(target);
  }
  render();
}

function handleBoardPointerCancel(): void {
  dragOrigin = null;
  dragEl = null;
  render();
}

// Left/Right move to the next dark square in the same row (2 columns over -- the light
// square between them isn't a valid stop). There's no dark square directly above or below
// another, so Up/Down move diagonally, preferring the left neighbour and falling back to
// the right one at an edge; Left/Right afterward reach the rest of that row.
function moveFocusInRow(deltaCol: number): void {
  const { row, col } = orientSquare(focusedSquare, VIEWING_SIDE);
  const next = squareAtOrientedCoordinates(row, col + deltaCol, VIEWING_SIDE);
  if (next !== undefined) {
    focusedSquare = next;
    render();
  }
}

function moveFocusBetweenRows(deltaRow: number): void {
  const { row, col } = orientSquare(focusedSquare, VIEWING_SIDE);
  const next =
    squareAtOrientedCoordinates(row + deltaRow, col - 1, VIEWING_SIDE) ??
    squareAtOrientedCoordinates(row + deltaRow, col + 1, VIEWING_SIDE);
  if (next !== undefined) {
    focusedSquare = next;
    render();
  }
}

function handleBoardKeyDown(event: KeyboardEvent): void {
  switch (event.key) {
    case "ArrowLeft":
      event.preventDefault();
      moveFocusInRow(-2);
      break;
    case "ArrowRight":
      event.preventDefault();
      moveFocusInRow(2);
      break;
    case "ArrowUp":
      event.preventDefault();
      moveFocusBetweenRows(-1);
      break;
    case "ArrowDown":
      event.preventDefault();
      moveFocusBetweenRows(1);
      break;
    case "Enter":
    case " ":
      event.preventDefault();
      activateSquare(focusedSquare);
      break;
    case "Escape":
      event.preventDefault();
      state = clearSelection(state);
      render();
      break;
    default:
      break;
  }
}

function render(): void {
  if (!boardRoot) return;

  // Whether focus was on the board has to be read *before* the subtree goes, because
  // replaceChildren moves it to the body. See the restore at the end.
  const hadFocus = boardRoot.contains(document.activeElement);
  boardRoot.replaceChildren();

  const layout = computeBoardLayout(state.position, VIEWING_SIDE);
  const destinations = new Map(legalDestinations(state).map((d) => [d.square, d.capture]));
  const board = document.createElement("div");
  board.className = "board";
  board.setAttribute("role", "grid");
  board.setAttribute("aria-label", "Checkers board");
  boardElRef = board;

  const squareElements = new Map<SquareIndex, HTMLElement>();

  for (let row = 0; row < 8; row++) {
    const rowEl = document.createElement("div");
    rowEl.className = "board__row";
    rowEl.setAttribute("role", "row");

    for (let col = 0; col < 8; col++) {
      const dark = (row + col) % 2 === 1;
      const el = document.createElement("div");
      el.className = `square ${dark ? "square--dark" : "square--light"}`;
      el.setAttribute("role", "gridcell");

      const index = squareAtOrientedCoordinates(row, col, VIEWING_SIDE);
      if (index === undefined) {
        el.setAttribute("aria-hidden", "true");
      } else {
        const piece = state.position.squares[index] ?? EMPTY;
        const isSelected = index === state.selected;
        const destinationCapture = destinations.get(index);
        el.setAttribute(
          "aria-label",
          squareLabel(index + 1, piece, {
            selected: isSelected,
            destination: destinations.has(index),
            capture: destinationCapture === true,
          }),
        );
        el.setAttribute("aria-selected", String(isSelected));
        el.tabIndex = index === focusedSquare ? 0 : -1;
        el.addEventListener("click", () => handleSquareClick(index));
        if (destinations.has(index)) {
          el.classList.add("square--destination");
          if (destinationCapture) {
            el.classList.add("square--capture");
          }
        }
        squareElements.set(index, el);
      }

      rowEl.appendChild(el);
    }

    board.appendChild(rowEl);
  }

  for (const piece of layout.pieces) {
    const index = squareAtOrientedCoordinates(piece.row, piece.col, VIEWING_SIDE);
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
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
  board.addEventListener("keydown", handleBoardKeyDown);

  boardRoot.appendChild(board);

  // render() rebuilds every element on every interaction, which would otherwise silently
  // drop keyboard focus after every move (R-46 wants it visible at all times, not just
  // between moves).
  //
  // Only when focus was already on the board, though. render() now also runs for a move
  // arriving from the opponent, and focusing a square then would drag the player out of
  // whatever they were actually using — a control in the connection panel, or anywhere else
  // on the page — every time the other side moved. Focus moving without the user asking is
  // the failure R-46 is guarding against, not a version of the guarantee.
  if (hadFocus) {
    squareElements.get(focusedSquare)?.focus();
  }
}

render();

const connectionRoot = document.querySelector<HTMLDivElement>("#connection-root");
if (connectionRoot) {
  // The composition root's one job that matters: the panel builds a transport, the session
  // is told about it, and neither has to know the other exists. This is the line that would
  // change, and the only one, if §9's client/server transport ever replaced the peer-to-peer
  // one — which is the migration contract D-1 was chosen on.
  mountConnectionPanel(connectionRoot, {
    onTransport: (transport) => {
      session.attach(transport);
    },
  });
}
