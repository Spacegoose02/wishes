"use client";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  // Ask for a second tap before submitting, e.g. "Delete for good?"
  confirm?: string;
  pendingLabel?: React.ReactNode;
};

// A form's submit button that shows progress while its server action runs.
export function SubmitButton({ confirm, pendingLabel, className = "btn", children, onClick, disabled, ...rest }: Props) {
  const { pending } = useFormStatus();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      {...rest}
      type="submit"
      className={`${className}${pending ? " is-pending" : ""}${armed ? " is-armed" : ""}`}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      onClick={(e) => {
        if (confirm && !armed) {
          e.preventDefault();
          setArmed(true);
          return;
        }
        setArmed(false);
        onClick?.(e);
      }}
    >
      {pending ? (
        <>
          <span className="spinner" aria-hidden="true" />
          {pendingLabel ?? children}
        </>
      ) : armed ? (
        confirm
      ) : (
        children
      )}
    </button>
  );
}
