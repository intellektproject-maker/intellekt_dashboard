"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "../../../components/Sidebar";
import Navbar from "..././../components/Navbar";

const API_BASE = "http://192.168.1.26:5050";

export default function AddFacultyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const adminRoll = searchParams.get("roll") || "";

  const [form, setForm] = useState({
    faculty_id: "",
    name: "",
    email: "",
    phone: "",
    subject_id: "",
    password: "",
  });

  const [saving, setSaving] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (
      !form.faculty_id.trim() ||
      !form.name.trim() ||
      !form.email.trim() ||
      !form.phone.trim() ||
      !String(form.subject_id).trim() ||
      !form.password.trim()
    ) {
      alert("Please fill all fields");
      return;
    }

    if (isNaN(Number(form.subject_id))) {
      alert("Subject ID must be a number");
      return;
    }

    try {
      setSaving(true);

      const res = await fetch(`${API_BASE}/faculty`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          faculty_id: form.faculty_id.trim().toUpperCase(),
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          subject_id: Number(form.subject_id),
          password: form.password.trim(),
        }),
      });

      const text = await res.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("Non-JSON response:", text);
        throw new Error("Backend did not return valid JSON");
      }

      if (!res.ok) {
        throw new Error(data?.error || "Failed to add faculty");
      }

      alert("Faculty added successfully");
      router.push(`/admin/faculty?roll=${adminRoll}`);
    } catch (err) {
      console.error("Add faculty error:", err);
      alert(err.message || "Failed to add faculty");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />

      <div className="flex-1">
        <Navbar />

        <div className="p-4 md:p-8">
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl font-bold text-blue-900">
              Add Faculty
            </h1>
            <p className="mt-1 text-gray-600">
              Enter the faculty details below
            </p>
          </div>

          <div className="max-w-3xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <form
              onSubmit={handleSubmit}
              className="grid grid-cols-1 gap-5 md:grid-cols-2"
            >
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Faculty ID
                </label>
                <input
                  type="text"
                  name="faculty_id"
                  value={form.faculty_id}
                  onChange={handleChange}
                  placeholder="IG001"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Full Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Enter faculty name"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="Enter email"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Phone Number
                </label>
                <input
                  type="text"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="Enter phone number"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Subject ID
                </label>
                <input
                  type="number"
                  name="subject_id"
                  value={form.subject_id}
                  onChange={handleChange}
                  placeholder="Enter subject ID"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Enter password"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex flex-wrap gap-3 pt-2 md:col-span-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-700 px-5 py-2.5 font-medium text-white transition hover:bg-blue-800 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Faculty"}
                </button>

                <button
                  type="button"
                  onClick={() => router.push(`/admin/faculty?roll=${adminRoll}`)}
                  className="rounded-lg bg-gray-200 px-5 py-2.5 font-medium text-gray-800 transition hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}