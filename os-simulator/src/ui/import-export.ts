export function exportJsonFile(filename: string, data: unknown): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function triggerJsonImport(
  onLoaded: (data: unknown) => void,
  onError: (error: string) => void
): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.style.display = "none";

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    input.remove();
    if (input.parentNode) {
      input.parentNode.removeChild(input);
    }
  };

  input.addEventListener("cancel", () => {
    cleanup();
  }, { once: true });

  input.addEventListener("change", () => {
    try {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          onLoaded(parsed);
        } catch (err) {
          onError(`Sintassi JSON non valida: ${err instanceof Error ? err.message : String(err)}`);
        }
      };
      reader.onerror = () => {
        onError("Impossibile leggere il file selezionato.");
      };
      reader.readAsText(file);
    } finally {
      cleanup();
    }
  });

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => cleanup(), 1000);
      },
      { once: true }
    );
  }

  document.body.appendChild(input);
  input.click();
}
