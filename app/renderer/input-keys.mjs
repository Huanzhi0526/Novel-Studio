export function sendIntent(event) {
  if (!event) return null;
  const composing = Boolean(
    event.isComposing
    || event.nativeEvent?.isComposing
    || event.keyCode === 229
    || event.nativeEvent?.keyCode === 229
  );
  if (composing || event.key !== 'Enter' || event.altKey) return null;
  if (event.shiftKey) return (event.ctrlKey || event.metaKey) ? null : 'newline';
  return 'send';
}
