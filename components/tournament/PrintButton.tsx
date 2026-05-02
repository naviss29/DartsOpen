"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:border-green-500 hover:text-green-700 transition-colors print:hidden"
    >
      🖨️ Imprimer
    </button>
  );
}
