"use client";

import { useState, useEffect } from "react";
import { ChevronDownIcon } from "@radix-ui/react-icons";

type Organization = {
  id: number;
  name: string;
};

type OrganizationSelectorProps = {
  organizations: Organization[];
  selectedOrgId: number | null;
  onOrgChange: (orgId: number) => void;
};

const STORAGE_KEY = "matrixai_selected_org";

export default function OrganizationSelector({
  organizations,
  selectedOrgId,
  onOrgChange,
}: OrganizationSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const storedId = Number(stored);
      // Only use stored value if it's a valid org
      if (organizations.some((org) => org.id === storedId)) {
        if (storedId !== selectedOrgId) {
          onOrgChange(storedId);
        }
      }
    }
  }, []);

  // Save to localStorage when selection changes
  useEffect(() => {
    if (selectedOrgId !== null) {
      localStorage.setItem(STORAGE_KEY, String(selectedOrgId));
    }
  }, [selectedOrgId]);

  const selectedOrg = organizations.find((org) => org.id === selectedOrgId);

  const handleSelect = (orgId: number) => {
    onOrgChange(orgId);
    setIsOpen(false);
  };

  if (organizations.length === 0) {
    return null;
  }

  return (
    <div className="org-selector">
      <button
        className="org-selector-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="org-selector-label">
          {selectedOrg?.name || "Select organization"}
        </span>
        <ChevronDownIcon
          className={`w-4 h-4 org-selector-chevron ${isOpen ? "open" : ""}`}
        />
      </button>

      {isOpen && (
        <>
          <div className="org-selector-backdrop" onClick={() => setIsOpen(false)} />
          <ul className="org-selector-dropdown" role="listbox">
            {organizations.map((org) => (
              <li
                key={org.id}
                role="option"
                aria-selected={org.id === selectedOrgId}
                className={`org-selector-option ${
                  org.id === selectedOrgId ? "selected" : ""
                }`}
                onClick={() => handleSelect(org.id)}
              >
                {org.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
