"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import Navbar from "../../components/Navbar";

const API_BASE = "/backend-api";

export default function AdminFacultyPage() {
  const searchParams = useSearchParams();
  const adminRoll = searchParams.get("roll") || "";

  const [faculty, setFaculty] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // ✅ SAFE FETCH
  async function loadFaculty() {
    try {
      setLoading(true);

      const res = await fetch(`${API_BASE}/faculty`);
      const text = await res.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("Non-JSON response:", text);
        throw new Error("Backend did not return JSON");
      }

      if (!res.ok) {
        throw new Error(data?.error || "Failed to fetch faculty");
      }

      setFaculty(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error loading faculty:", err);
      alert(err.message || "Failed to load faculty");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFaculty();
  }, []);

  // ✅ SAFE DELETE
  async function handleDelete(facultyId) {
    const ok = confirm(`Are you sure you want to delete faculty ${facultyId}?`);
    if (!ok) return;

    try {
      const res = await fetch(`${API_BASE}/faculty/${facultyId}`, {
        method: "DELETE",
      });

      const text = await res.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("Non-JSON response:", text);
        throw new Error("Delete failed (invalid response)");
      }

      if (!res.ok) {
        throw new Error(data?.error || "Failed to delete faculty");
      }

      alert("Faculty deleted successfully");
      loadFaculty();
    } catch (err) {
      console.error("Delete error:", err);
      alert(err.message || "Failed to delete faculty");
    }
  }

  // ✅ FILTER (MATCHES YOUR DB)
  const filteredFaculty = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return faculty;

    return faculty.filter((f) => {
      const searchText = [
        f.faculty_id,
        f.name,
        f.email,
        f.phone,
        f.subject_id,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");

      return searchText.includes(q);
    });
  }, [faculty, search]);

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />

      <div className="flex-1">
        <Navbar />

        <div className="p-4 md:p-8">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-blue-900">
                Faculty Management
              </h1>
              <p className="mt-1 text-gray-600">
                View, search, add, edit and delete faculty details
              </p>
            </div>

            <Link
              href={`/admin/faculty/add?roll=${adminRoll}`}
              className="inline-flex items-center justify-center rounded-lg bg-blue-700 px-5 py-2.5 font-medium text-white transition hover:bg-blue-800"
            >
              + Add Faculty
            </Link>
          </div>

          <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <input
              type="text"
              placeholder="Search by faculty ID, name, email, phone or subject ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-600"
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {loading ? (
              <div className="p-6 text-center text-gray-600">
                Loading faculty...
              </div>
            ) : filteredFaculty.length === 0 ? (
              <div className="p-6 text-center text-gray-600">
                No faculty found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-blue-900 text-white">
                    <tr>
                      <th className="px-4 py-3 text-left">Faculty ID</th>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left">Email</th>
                      <th className="px-4 py-3 text-left">Phone</th>
                      <th className="px-4 py-3 text-left">Subject ID</th>
                      <th className="px-4 py-3 text-left">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredFaculty.map((f, index) => (
                      <tr
                        key={f.faculty_id || index}
                        className="border-t border-gray-200 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {f.faculty_id || "-"}
                        </td>
                        <td className="px-4 py-3">{f.name || "-"}</td>
                        <td className="px-4 py-3">{f.email || "-"}</td>
                        <td className="px-4 py-3">{f.phone || "-"}</td>
                        <td className="px-4 py-3">
                          {f.subject_id ?? "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/admin/faculty/edit?id=${f.faculty_id}&roll=${adminRoll}`}
                              className="rounded-lg bg-yellow-500 px-3 py-1.5 text-white transition hover:bg-yellow-600"
                            >
                              Edit
                            </Link>

                            <button
                              onClick={() => handleDelete(f.faculty_id)}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-white transition hover:bg-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}