export function playSe() {
  const a = new Audio("/sounds/start.mp3");
  a.volume = 0.3;
  a.play().catch(() => {});
}
