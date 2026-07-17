import { useToastStore } from "../state/toastStore";

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto min-w-64 rounded-md px-4 py-3 text-sm text-white shadow-lg ${
            toast.kind === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{toast.message}</span>
            <button onClick={() => dismiss(toast.id)} className="text-white/80 hover:text-white">
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
