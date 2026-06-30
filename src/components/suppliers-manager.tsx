"use client";

import { useState } from "react";

type Supplier = {
  id: string;
  name: string;
  emailAddresses: string[];
  emailDomains: string[];
};

type SuppliersManagerProps = {
  initialSuppliers: Supplier[];
};

export function SuppliersManager({ initialSuppliers }: SuppliersManagerProps) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [error, setError] = useState<string | null>(null);

  async function refreshSuppliers() {
    const response = await fetch("/api/admin/suppliers");
    if (!response.ok) {
      setError("Failed to load suppliers");
      return;
    }
    setSuppliers(await response.json());
  }

  async function createSupplier(formData: FormData) {
    const emailAddresses = String(formData.get("emailAddresses") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const emailDomains = String(formData.get("emailDomains") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const response = await fetch("/api/admin/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name")),
        emailAddresses,
        emailDomains,
      }),
    });

    if (!response.ok) {
      setError("Failed to create supplier");
      return;
    }

    await refreshSuppliers();
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="font-medium">Suppliers ({suppliers.length})</h3>
        </div>
        <ul className="divide-y divide-slate-100">
          {suppliers.length === 0 ? (
            <li className="px-4 py-6 text-sm text-slate-500">No suppliers yet.</li>
          ) : (
            suppliers.map((supplier) => (
              <li key={supplier.id} className="px-4 py-4 text-sm">
                <p className="font-medium">{supplier.name}</p>
                <p className="text-slate-500">
                  Emails: {supplier.emailAddresses.join(", ") || "—"}
                </p>
                <p className="text-slate-500">
                  Domains: {supplier.emailDomains.join(", ") || "—"}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>

      <form
        action={async (formData) => {
          await createSupplier(formData);
        }}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h3 className="font-medium">Add supplier</h3>
        <input name="name" required placeholder="Supplier name" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="emailAddresses" placeholder="Email addresses (comma-separated)" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="emailDomains" placeholder="Email domains (comma-separated)" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Create supplier
        </button>
      </form>
    </div>
  );
}
