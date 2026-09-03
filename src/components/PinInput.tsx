// src/components/PinInput.tsx
"use client";

import { useRef, useState } from "react";

export function PinInput({
  name,
  onChange,
}: {
  name: string;
  onChange?: (value: string) => void;
}) {
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  function update(next: string[]) {
    setDigits(next);
    onChange?.(next.join(""));
  }

  function handleChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    update(next);
    if (digit && index < 3) inputsRef.current[index + 1]?.focus();
  }

  function handleKeyDown(
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  return (
    <div>
      <div className="flex gap-2.5">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            inputMode="numeric"
            autoComplete="off"
            maxLength={1}
            aria-label={`PIN digit ${i + 1}`}
            className="h-14 w-12 rounded-xl border border-border bg-bg text-center text-[22px] font-bold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        ))}
      </div>
      <input type="hidden" name={name} value={digits.join("")} />
    </div>
  );
}
