"use client";

import { BookPlus, FlaskConical, GraduationCap, ShieldCheck } from "lucide-react";

export function QuickActions({
  onAdd,
  onTests,
  onLearn,
}: {
  onAdd: () => void;
  onTests: () => void;
  onLearn: () => void;
}) {
  const actions = [
    { label: "Добавить материал", icon: BookPlus, onClick: onAdd },
    { label: "Проверить ответы AI", icon: ShieldCheck, onClick: onTests },
    { label: "Запустить AI Test Center", icon: FlaskConical, onClick: onTests },
    { label: "Обучить бота", icon: GraduationCap, onClick: onLearn },
  ];

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-neutral-700">Быстрые действия</h3>
      <div className="grid gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className="flex items-center gap-3 rounded-xl border border-neutral-200/80 bg-white px-3 py-3 text-left text-sm font-medium text-neutral-800 hover:border-blue-200 hover:bg-blue-50/50"
          >
            <action.icon className="h-4 w-4 text-blue-700" />
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}
