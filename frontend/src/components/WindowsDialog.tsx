import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/**
 * Chrome that mimics the classic Windows "New Object" MMC dialogs (blue
 * title bar, "Erstellen in:" path row, light-gray button footer) so the
 * user/group/OU creation dialogs read as an authentic ADUC clone rather
 * than a generic web modal.
 */
export interface WinTab {
  id: string;
  label: string;
}

export function WindowsDialog({
  title,
  icon,
  createIn,
  tabs,
  activeTab,
  onTabChange,
  onClose,
  footer,
  children,
  maxWidthClassName = "max-w-xl",
}: {
  title: string;
  icon?: ReactNode;
  createIn?: string;
  tabs?: WinTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
  maxWidthClassName?: string;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className={`flex max-h-[90vh] w-full ${maxWidthClassName} flex-col overflow-hidden rounded-sm shadow-2xl ring-1 ring-black/20`}>
        <div className="flex items-center justify-between bg-gradient-to-b from-[#4c9be8] to-[#1c6bb4] px-3 py-1.5">
          <span className="text-sm font-medium text-white">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="flex h-5 w-6 items-center justify-center rounded-sm text-sm text-white/90 hover:bg-red-600 hover:text-white"
          >
            ×
          </button>
        </div>

        {createIn && (
          <div className="flex items-center gap-3 border-b border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center">{icon}</div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500 dark:text-slate-400">Erstellen in:</div>
              <div className="truncate text-sm text-slate-800 dark:text-slate-200">{createIn}</div>
            </div>
          </div>
        )}

        {tabs && (
          <div className="flex flex-wrap gap-0.5 border-b border-slate-300 bg-[#ece9d8] px-2 pt-1.5 dark:border-slate-700 dark:bg-slate-800">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange?.(tab.id)}
                className={`rounded-t-sm border px-3 py-1 text-xs ${
                  activeTab === tab.id
                    ? "border-slate-400 border-b-white bg-white font-medium text-slate-900 dark:border-slate-600 dark:border-b-slate-900 dark:bg-slate-900 dark:text-slate-100"
                    : "border-transparent text-slate-600 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
                style={activeTab === tab.id ? { marginBottom: -1 } : undefined}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-white px-4 py-4 dark:bg-slate-900">{children}</div>

        <div className="flex justify-end gap-2 border-t border-slate-300 bg-[#f0f0f0] px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
          {footer}
        </div>
      </div>
    </div>
  );
}

export function WindowsButton({
  variant = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" }) {
  return (
    <button
      {...props}
      className={`min-w-24 rounded-sm border px-4 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
        variant === "primary"
          ? "border-[#0a5cb8] bg-[#e5f1fb] text-slate-900 hover:bg-[#cce4f7] dark:border-[#3a8fd9] dark:bg-slate-700 dark:text-slate-100"
          : "border-slate-400 bg-[#f0f0f0] text-slate-800 hover:bg-white dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
      } ${props.className ?? ""}`}
    />
  );
}

const winInputClass =
  "w-full rounded-sm border border-slate-400 bg-white px-2 py-1 text-sm text-slate-900 focus:border-[#1c6bb4] focus:outline-none focus:ring-1 focus:ring-[#1c6bb4] disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-900 dark:disabled:text-slate-500";

export function WinInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${winInputClass} ${props.className ?? ""}`} />;
}

export function WinSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${winInputClass} ${props.className ?? ""}`} />;
}

export function WinTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${winInputClass} ${props.className ?? ""}`} />;
}

export function WinLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm text-slate-800 dark:text-slate-200">
      {children}
    </label>
  );
}

export function WinCheckbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
      <input type="checkbox" {...props} className="h-4 w-4 rounded-none border-slate-400 text-[#1c6bb4] focus:ring-[#1c6bb4]" />
      {label}
    </label>
  );
}
