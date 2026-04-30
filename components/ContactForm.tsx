"use client";

import { useState } from "react";

const SUBJECTS = [
  { value: "reclamation", label: "📣 Réclamation" },
  { value: "idee", label: "💡 Boîte à idées" },
  { value: "remerciement", label: "🙏 Remerciement" },
  { value: "bug", label: "🐛 Signaler un bug" },
  { value: "autre", label: "💬 Autre" },
];

const inputCn =
  "w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

// TODO: remplacer par l'email réel de contact DartsOpen / Stêr Eo
const CONTACT_EMAIL = "contact@dartsopen.fr";

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [subject, setSubject] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = fd.get("name") as string;
    const email = fd.get("email") as string;
    const subjectLabel = SUBJECTS.find(s => s.value === fd.get("subject"))?.label ?? fd.get("subject");
    const message = fd.get("message") as string;

    const body = encodeURIComponent(
      `Nom : ${name}\nEmail : ${email}\n\nSujet : ${subjectLabel}\n\n${message}`
    );
    const mailtoSubject = encodeURIComponent(`[DartsOpen] ${subjectLabel}`);

    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${mailtoSubject}&body=${body}`;
    setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center space-y-3 py-6">
        <p className="text-4xl">✉️</p>
        <p className="font-semibold text-white">Votre client mail s&apos;est ouvert</p>
        <p className="text-sm text-gray-400">
          Envoyez le message pré-rempli pour nous contacter. Merci !
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Nom *</label>
          <input name="name" type="text" required placeholder="Jean Dupont" className={inputCn} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Email *</label>
          <input name="email" type="email" required placeholder="jean@exemple.fr" className={inputCn} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Sujet *</label>
        <select
          name="subject"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={inputCn}
        >
          <option value="" disabled className="bg-gray-900">Choisir un sujet…</option>
          {SUBJECTS.map((s) => (
            <option key={s.value} value={s.value} className="bg-gray-900">{s.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Message *</label>
        <textarea
          name="message"
          required
          rows={5}
          placeholder="Décrivez votre demande…"
          className={`${inputCn} resize-none`}
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
      >
        Envoyer le message →
      </button>
    </form>
  );
}
