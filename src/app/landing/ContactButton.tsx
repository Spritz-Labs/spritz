"use client";

import { useState } from "react";
import { ContactForm } from "@/components/ContactForm";

interface ContactButtonProps {
    className?: string;
}

export function ContactButton({ className }: ContactButtonProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button onClick={() => setIsOpen(true)} className={className}>
                Contact
            </button>
            <ContactForm
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                source="landing"
            />
        </>
    );
}
