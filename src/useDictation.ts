import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The Web Speech API is still vendor-prefixed in Safari and absent in Firefox,
 * and TypeScript's DOM library does not describe it. Only the parts used here
 * are declared — a fuller definition would be guessing at a moving target.
 */
type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = { 0: SpeechRecognitionAlternative; isFinal: boolean; length: number };
type SpeechRecognitionEvent = { resultIndex: number; results: { length: number } & Record<number, SpeechRecognitionResult> };
type SpeechRecognitionErrorEvent = { error: string };

type SpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognition;

function constructor(): SpeechRecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Whether this browser can dictate at all. Firefox cannot. */
export function dictationSupported(): boolean {
  return typeof window !== "undefined" && constructor() !== null;
}

/**
 * A permission the user refused, and a microphone that heard nothing, are
 * different problems with different answers — so they get different sentences
 * rather than one generic failure.
 */
export function dictationErrorMessage(error: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Mikrofonen är blockerad. Tillåt mikrofon för den här sidan och försök igen.";
    case "no-speech":
      return "Hörde ingenting. Försök igen.";
    case "audio-capture":
      return "Hittade ingen mikrofon.";
    case "network":
      return "Taligenkänningen kunde inte nås.";
    default:
      return "Dikteringen avbröts.";
  }
}

/**
 * Appends what is said to whatever the field already holds, rather than
 * replacing it: dictation is a way of adding to what is being written, and a
 * slip of the microphone should never wipe out typing.
 *
 * Copied from the admin portal rather than shared through a package. A third
 * client is when that trade turns — until then a shared package costs more
 * coordination than it saves.
 */
export function appendTranscript(existing: string, transcript: string): string {
  const spoken = transcript.trim();
  if (!spoken) return existing;
  if (!existing.trim()) return spoken;
  return /\s$/.test(existing) ? existing + spoken : `${existing} ${spoken}`;
}

export type Dictation = {
  supported: boolean;
  listening: boolean;
  /** What is being said right now, before it is final. Shown as a hint. */
  interim: string;
  error: string;
  toggle: () => void;
};

export function useDictation(onFinal: (text: string) => void): Dictation {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Kept in a ref so the recognition object, created once, always calls the
  // newest handler rather than the one captured when dictation started.
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const toggle = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const Recognition = constructor();
    if (!Recognition) {
      setError("Den här webbläsaren stöder inte diktering.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "sv-SE";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let pending = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) {
          finalRef.current(result[0].transcript);
        } else {
          pending += result[0].transcript;
        }
      }
      setInterim(pending);
    };

    recognition.onerror = (event) => setError(dictationErrorMessage(event.error));

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      setInterim("");
    };

    recognitionRef.current = recognition;
    setError("");
    setInterim("");
    setListening(true);
    recognition.start();
  }, []);

  return { supported: dictationSupported(), listening, interim, error, toggle };
}
