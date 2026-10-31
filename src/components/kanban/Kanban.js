'use client';

// The Kanban pieces every board is built from (leads, installation steps): a board that watches drops and scrolls
// sideways, columns that are drop targets and scroll on their own, and cards that drag with a custom preview.
// Built on @atlaskit/pragmatic-drag-and-drop: native HTML drag, so it is smooth and cheap, with auto-scroll added.
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { triggerPostMoveFlash } from '@atlaskit/pragmatic-drag-and-drop-flourish/trigger-post-move-flash';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../kit';

const BoardContext = createContext({ type: 'card', dragging: null });

/** What is in the air right now: { id, columnId, ...data } or null. */
export const useKanbanDragging = () => useContext(BoardContext).dragging;

/** Briefly highlight the card with this id (after it landed in its new column). */
export function flashCard(id) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-kanban-card="${CSS.escape(String(id))}"]`);
    if (el) triggerPostMoveFlash(el);
  });
}

/**
 * The board: a horizontal strip of columns. `onMove(data, toColumnId)` fires when a card is dropped on another column.
 * `type` keeps boards apart (a lead card never lands on a step column).
 */
export function KanbanBoard({ type = 'card', onMove, className, children }) {
  const ref = useRef(null);
  const [dragging, setDragging] = useState(null);

  useEffect(() => {
    const board = ref.current;
    if (!board) return undefined;
    const isMine = ({ source }) => source.data.type === type;
    return combine(
      monitorForElements({
        canMonitor: isMine,
        onDragStart: ({ source }) => setDragging(source.data),
        onDrop: ({ source, location }) => {
          setDragging(null);
          const target = location.current.dropTargets[0];
          if (!target || target.data.columnId === source.data.columnId) return;
          onMove?.(source.data, target.data.columnId);
        },
      }),
      autoScrollForElements({ element: board, canScroll: isMine }), // scrolls sideways while a card hovers near an edge
    );
  }, [type, onMove]);

  return (
    <BoardContext.Provider value={{ type, dragging }}>
      <div ref={ref} className={cx('-mx-1 flex gap-4 overflow-x-auto px-1 pb-3', className)}>{children}</div>
    </BoardContext.Provider>
  );
}

/**
 * A column: a drop target with its own vertical auto-scroll. `droppable` says whether cards may land here: a boolean,
 * or a function of the dragged card's data (so a board can allow only the next step, say). `header` and `empty` are
 * rendered by the board that owns it.
 */
export function KanbanColumn({ id, label, droppable = true, header, empty, width = 'w-72', className, children }) {
  const { type, dragging } = useContext(BoardContext);
  const ref = useRef(null);
  const listRef = useRef(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const element = ref.current;
    const list = listRef.current;
    if (!element || !list) return undefined;
    const isMine = ({ source }) => source.data.type === type;
    return combine(
      dropTargetForElements({
        element,
        getData: () => ({ columnId: id }),
        canDrop: (args) => isMine(args) && args.source.data.columnId !== id && (typeof droppable === 'function' ? droppable(args.source.data) : droppable),
        onDragEnter: () => setOver(true),
        onDragLeave: () => setOver(false),
        onDrop: () => setOver(false),
      }),
      autoScrollForElements({ element: list, canScroll: isMine }),
    );
  }, [id, type, droppable]);

  const foreign = dragging && dragging.columnId !== id; // a card from elsewhere is in the air
  const allowed = !dragging || (typeof droppable === 'function' ? droppable(dragging) : droppable);
  return (
    <section
      ref={ref}
      aria-label={label}
      className={cx(
        'flex h-full shrink-0 flex-col rounded-xl border bg-slate-50/80 transition-[background-color,box-shadow,border-color,opacity] duration-150',
        width,
        over ? 'border-brand bg-brand-soft/50 shadow-[inset_0_0_0_2px_var(--brand)]' : 'border-slate-200',
        foreign && !allowed && 'opacity-60',
        className,
      )}
    >
      {header}
      <div ref={listRef} className="flex min-h-[6rem] flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {children}
        {empty && (
          <div className={cx('m-1 grid flex-1 place-items-center rounded-lg border border-dashed px-3 py-6 text-center text-xs', over ? 'border-brand text-brand' : 'border-slate-200 text-slate-400')}>
            {foreign && allowed ? 'Drop here' : empty}
          </div>
        )}
      </div>
    </section>
  );
}

/** The column header most boards want: a colour dot, the name, extras, and the count. */
export function KanbanColumnHeader({ color, name, muted, count, children }) {
  return (
    <header className="flex items-center gap-2 px-3 py-2.5">
      {color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />}
      <h2 className={cx('min-w-0 truncate text-sm font-semibold', muted ? 'text-slate-400 line-through' : 'text-slate-900')}>{name}</h2>
      {children}
      <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 tabular-nums ring-1 ring-slate-200 ring-inset">{count}</span>
    </header>
  );
}

/**
 * A card. `data` travels with the drag (the board gets it back in onMove, with `columnId` and `id` added). While it is
 * dragged the card fades and `preview` (or the children) follows the pointer. Click or Enter opens it.
 */
export function KanbanCard({ id, columnId, data = {}, canDrag = true, preview, onOpen, className, children }) {
  const { type } = useContext(BoardContext);
  const ref = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [previewContainer, setPreviewContainer] = useState(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !canDrag) return undefined;
    return draggable({
      element,
      getInitialData: () => ({ ...data, type, id, columnId }),
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        setCustomNativeDragPreview({
          nativeSetDragImage,
          getOffset: pointerOutsideOfPreview({ x: '12px', y: '8px' }),
          render({ container }) {
            setPreviewContainer(container);
            return () => setPreviewContainer(null);
          },
        });
      },
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    });
    // `data` is a fresh object each render; the fields that matter are id and columnId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, columnId, type, canDrag]);

  return (
    <>
      <div
        ref={ref}
        data-kanban-card={id}
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen ? () => onOpen() : undefined}
        onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } : undefined}
        className={cx(
          'rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-[opacity,box-shadow] duration-150 select-none hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          canDrag ? 'cursor-grab active:cursor-grabbing' : onOpen ? 'cursor-pointer' : '',
          dragging && 'opacity-40',
          className,
        )}
      >
        {children}
      </div>
      {previewContainer && createPortal(
        <div className="w-72 rotate-[1.5deg] rounded-lg border border-brand/40 bg-white p-3 shadow-xl ring-2 ring-brand/30">{preview ?? children}</div>,
        previewContainer,
      )}
    </>
  );
}
