// Validate editable fields before creating a durable browser operation.
export function validateUserInput(note, tags) {
  const bytes = value => new TextEncoder().encode(value).length;
  if (typeof note !== 'string' || bytes(note) > 50000 || note.includes('\0')) throw new Error('メモはUTF-8で50,000バイト以内に短くしてください（日本語は約16,000文字まで）。');
  if (!Array.isArray(tags) || tags.length > 30 || tags.some(tag => typeof tag !== 'string' || bytes(tag) > 100 || tag.includes('\0'))) throw new Error('タグは30個まで、各100バイト以内にしてください。');
}
