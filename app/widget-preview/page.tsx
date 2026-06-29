"use client";

import {
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  ChevronUp,
  MapPin,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";

const serviceItems = [
  {
    title: "Оплата ЕПД",
    text: "Проверка начислений, платежей и статуса оплаты.",
    icon: WalletCards,
  },
  {
    title: "Квитанции",
    text: "Электронные квитанции, дубликаты и история ЕПД.",
    icon: ReceiptText,
  },
  {
    title: "Показания",
    text: "Передача и корректировка показаний приборов учета.",
    icon: Zap,
  },
  {
    title: "Поставщики",
    text: "Поиск организации, БИН, кода и ответственного менеджера.",
    icon: Building2,
  },
];

const newsItems = [
  "Прием граждан руководством проводится по предварительной записи.",
  "Для технических вопросов по онлайн-сервисам доступен WhatsApp-канал.",
  "В личном кабинете можно проверить начисления и историю квитанций.",
];

export default function WidgetPreviewPage() {
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [widgetFullscreen, setWidgetFullscreen] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "ASTANA_ERC_WIDGET_CLOSE") {
        setWidgetOpen(false);
        setWidgetFullscreen(false);
      }

      if (event.data?.type === "ASTANA_ERC_WIDGET_FULLSCREEN") {
        setWidgetFullscreen(Boolean(event.data.fullscreen));
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <main className="min-h-screen bg-[#eef4fb] text-neutral-950">
      <header className="sticky top-0 z-20 border-b border-white/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <BrandMark size="md" variant="full" />
            <div className="hidden sm:block">
              <div className="text-sm font-semibold">ТОО «Астана-ЕРЦ»</div>
              <div className="text-xs text-neutral-500">
                Единый расчетный центр
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-6 text-sm font-medium text-neutral-600 md:flex">
            <a className="hover:text-blue-700" href="#services">
              Услуги
            </a>
            <a className="hover:text-blue-700" href="#payments">
              Оплата
            </a>
            <a className="hover:text-blue-700" href="#contacts">
              Контакты
            </a>
          </nav>

          <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">
            Личный кабинет
          </button>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:py-14">
        <div className="flex flex-col justify-center">
          <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm">
            <ShieldCheck size={14} />
            Коммунальные сервисы города в одном окне
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-neutral-950 md:text-5xl">
            Оплата, квитанции и обращения по услугам Астана-ЕРЦ
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-600">
            Демонстрационная страница показывает, как помощник будет выглядеть
            поверх реального сайта: посетитель читает информацию, а виджет
            остается доступным в правом нижнем углу.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={() => setWidgetOpen(true)}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Открыть помощника
              <ArrowRight size={16} />
            </button>
            <a
              href="#services"
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 transition hover:border-blue-200 hover:text-blue-700"
            >
              Посмотреть услуги
            </a>
          </div>
        </div>

        <div className="rounded-lg border border-white/80 bg-white/90 p-5 shadow-xl shadow-blue-950/10">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
            <div>
              <div className="text-sm font-semibold">Сводка по лицевому счету</div>
              <div className="text-xs text-neutral-500">
                Пример информационного блока сайта
              </div>
            </div>
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
              Активно
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-[#f6f9fc] p-4">
              <div className="text-xs text-neutral-500">К оплате</div>
              <div className="mt-2 text-2xl font-semibold">18 420 ₸</div>
            </div>
            <div className="rounded-lg bg-[#f6f9fc] p-4">
              <div className="text-xs text-neutral-500">Последний платеж</div>
              <div className="mt-2 text-2xl font-semibold">25.06</div>
            </div>
            <div className="rounded-lg bg-[#f6f9fc] p-4">
              <div className="text-xs text-neutral-500">Квитанция</div>
              <div className="mt-2 text-sm font-semibold">Июнь 2026</div>
            </div>
            <div className="rounded-lg bg-[#f6f9fc] p-4">
              <div className="text-xs text-neutral-500">Поддержка</div>
              <div className="mt-2 text-sm font-semibold">109</div>
            </div>
          </div>
        </div>
      </section>

      <section id="services" className="mx-auto max-w-7xl px-5 pb-12">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Популярные разделы</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Здесь виджет не мешает основному сайту и остается под рукой.
            </p>
          </div>
          <button
            onClick={() => setWidgetOpen(true)}
            className="hidden rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 sm:inline-flex"
          >
            Задать вопрос
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {serviceItems.map((item) => {
            const Icon = item.icon;

            return (
              <article
                key={item.title}
                className="rounded-lg border border-white/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                  <Icon size={19} />
                </div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-500">
                  {item.text}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 pb-16 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="rounded-lg border border-white/80 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 font-semibold">
            <MapPin className="text-blue-700" size={18} />
            Контакты
          </div>
          <div className="space-y-3 text-sm leading-6 text-neutral-600">
            <p>Центр городских услуг Qalaqyzmet</p>
            <p>г. Астана, ул. Сәкен Сейфуллин, 27</p>
            <p>Телефон: 109</p>
          </div>
        </div>

        <div className="rounded-lg border border-white/80 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 font-semibold">
            <Bell className="text-blue-700" size={18} />
            Объявления
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {newsItems.map((item) => (
              <div key={item} className="rounded-md bg-[#f6f9fc] p-3 text-sm leading-6 text-neutral-600">
                <CheckCircle2 className="mb-2 text-emerald-600" size={16} />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/80 bg-white/70 px-5 py-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 text-sm text-neutral-500 md:flex-row md:items-center md:justify-between">
          <span>Демо-предпросмотр размещения AI-помощника</span>
          <span>Астана-ЕРЦ · MVP</span>
        </div>
      </footer>

      <button
        onClick={() => setWidgetOpen((value) => !value)}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-2xl shadow-blue-900/30 transition hover:-translate-y-0.5 hover:bg-blue-700"
        aria-label={widgetOpen ? "Закрыть помощника" : "Открыть помощника"}
        title={widgetOpen ? "Закрыть помощника" : "Открыть помощника"}
      >
        {widgetOpen ? <X size={22} /> : <MessageCircle size={23} />}
      </button>

      {widgetOpen && (
        <div
          className={
            widgetFullscreen
              ? "fixed inset-4 z-50 overflow-hidden rounded-lg border border-white/80 bg-white shadow-2xl shadow-blue-950/25"
              : "fixed bottom-24 right-5 z-40 h-[640px] max-h-[calc(100vh-120px)] w-[390px] max-w-[calc(100vw-40px)] overflow-hidden rounded-lg border border-white/80 bg-white shadow-2xl shadow-blue-950/25"
          }
        >
          <iframe
            src="/widget"
            title="AI помощник Астана-ЕРЦ"
            className="h-full w-full border-0"
          />
        </div>
      )}

      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-5 left-5 z-30 hidden h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-lg transition hover:text-blue-700 md:flex"
        aria-label="Наверх"
        title="Наверх"
      >
        <ChevronUp size={18} />
      </button>
    </main>
  );
}
