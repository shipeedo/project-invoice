"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Suppliers ({suppliers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Emails</TableHead>
                <TableHead>Domains</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    No suppliers yet.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell>{supplier.emailAddresses.join(", ") || "—"}</TableCell>
                    <TableCell>{supplier.emailDomains.join(", ") || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add supplier</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={async (formData) => {
              await createSupplier(formData);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="name">Supplier name</Label>
              <Input id="name" name="name" required placeholder="Supplier name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailAddresses">Email addresses</Label>
              <Input
                id="emailAddresses"
                name="emailAddresses"
                placeholder="Comma-separated"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailDomains">Email domains</Label>
              <Input id="emailDomains" name="emailDomains" placeholder="Comma-separated" />
            </div>
            <Button type="submit">Create supplier</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
