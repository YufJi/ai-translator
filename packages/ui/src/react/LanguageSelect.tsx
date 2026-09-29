import { LANGUAGES, type LanguageTag } from "@ai-translator/core";
import type { ChangeEvent } from "react";

export interface LanguageSelectProps {
  value: string;
  onChange: (value: string) => void;
  includeAuto?: boolean;
  id?: string;
  className?: string;
  title?: string;
  disabled?: boolean;
}

const PINNED: readonly LanguageTag[] = ["zh-Hans", "zh-Hant", "en-US", "ja", "ko"];

export function LanguageSelect({
  value,
  onChange,
  includeAuto = false,
  id,
  className,
  title,
  disabled,
}: LanguageSelectProps) {
  const pinned = LANGUAGES.filter((language) => PINNED.includes(language.tag));
  const rest = LANGUAGES.filter((language) => !PINNED.includes(language.tag));

  return (
    <select
      id={id}
      className={className}
      title={title}
      disabled={disabled}
      value={value}
      onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
    >
      {includeAuto ? <option value="auto">自动识别</option> : null}
      {[...pinned, ...rest].map((language) => (
        <option key={language.tag} value={language.tag}>
          {language.name} · {language.tag}
        </option>
      ))}
    </select>
  );
}

export const AUTO_LANGUAGE_VALUE = "auto";

