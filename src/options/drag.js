/**
 * Drag to reorder by each row's handle. Rows become draggable only while the handle is held, so dragging inside
 * a row's tag input still selects its text. `onDrop(id, targetId, after)` saves the new order.
 */
export function attachDrag(list, { canDrag, onDrop }) {
  let dragId = null;

  list.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('.handle');
    if (handle && canDrag()) handle.closest('.profile').draggable = true;
  });

  document.addEventListener('pointerup', () => {
    if (!dragId) for (const row of list.querySelectorAll('[draggable="true"]')) row.draggable = false;
  });

  function clearDropMarks() {
    for (const row of list.querySelectorAll('.drop-before, .drop-after')) row.classList.remove('drop-before', 'drop-after');
  }

  function dropTarget(event) {
    const row = event.target.closest?.('.profile');
    if (!dragId || !row || row.dataset.id === dragId) return null;
    const { top, height } = row.getBoundingClientRect();
    return { id: row.dataset.id, row, after: event.clientY > top + height / 2 };
  }

  function endDrag() {
    dragId = null;
    clearDropMarks();
    for (const row of list.querySelectorAll('.dragging, [draggable="true"]')) {
      row.classList.remove('dragging');
      row.draggable = false;
    }
  }

  list.addEventListener('dragstart', (event) => {
    // A text drag out of the tag input starts on the input, not on the row.
    if (!event.target.matches?.('.profile') || !canDrag()) return;
    dragId = event.target.dataset.id;
    event.target.classList.add('dragging');
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });

  list.addEventListener('dragover', (event) => {
    const target = dropTarget(event);
    clearDropMarks();
    if (!target) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    target.row.classList.add(target.after ? 'drop-after' : 'drop-before');
  });

  list.addEventListener('dragleave', (event) => {
    if (!list.contains(event.relatedTarget)) clearDropMarks();
  });

  list.addEventListener('drop', async (event) => {
    const target = dropTarget(event);
    const id = dragId;
    endDrag();
    if (!target) return;
    event.preventDefault();
    await onDrop(id, target.id, target.after);
  });

  list.addEventListener('dragend', endDrag);
}
