"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://responsible-wonder-production.up.railway.app";

function PostTestInner() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get("id") || "";

  const [testCode, setTestCode] = useState("");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [marks, setMarks] = useState("");
  const [portion, setPortion] = useState("");
  const [chapter, setChapter] = useState("");
  const [className, setClassName] = useState("");
  const [board, setBoard] = useState("");
  const [duration, setDuration] = useState("");
  const [registrationEndDate, setRegistrationEndDate] = useState("");
  const [writingAllowedTill, setWritingAllowedTill] = useState("");

  const [classes, setClasses] = useState([]);
  const [postedTests, setPostedTests] = useState([]);
const [editingTestCode, setEditingTestCode] = useState("");
const [saving, setSaving] = useState(false);

const [searchCode, setSearchCode] = useState("");
const [currentPage, setCurrentPage] = useState(1);

const testsPerPage = 10;

  useEffect(() => {
    async function loadClasses() {
      try {
        const res = await fetch(`${API_BASE}/classes`, { cache: "no-store" });
        const data = await res.json();
        setClasses(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Classes fetch failed:", err);
        setClasses([]);
      }
    }

    loadClasses();
  }, []);

  async function loadPostedTests() {
    try {
      const res = await fetch(`${API_BASE}/posted-tests`, { cache: "no-store" });
      const data = await res.json();

console.log("POSTED TESTS API:", data);

setPostedTests(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Posted tests fetch failed:", err);
      setPostedTests([]);
    }
  }

  useEffect(() => {
    loadPostedTests();
  }, []);

  function handleClassChange(e) {
    const val = e.target.value;

    if (!val) {
      setClassName("");
      setBoard("");
      return;
    }

    const [cls, brd] = val.split("||");
    setClassName(cls || "");
    setBoard(brd || "");
  }

  function formatDate(dateValue) {
    if (!dateValue) return "-";

    const d = new Date(dateValue);

    if (Number.isNaN(d.getTime())) return "-";

    return d.toLocaleDateString("en-IN");
  }

  function toInputDate(dateValue) {
    if (!dateValue) return "";

    const d = new Date(dateValue);

    if (Number.isNaN(d.getTime())) return "";

    return d.toISOString().split("T")[0];
  }

    function extractMarksFromTestCode(code) {
    if (!code) return "";

    const upperCode = code.toUpperCase();

    const match = upperCode.match(/[MP](\d+)/);

    return match ? match[1] : "";
  }

  function resetForm() {
    setTestCode("");
    setSubject("");
    setDate("");
    setMarks("");
    setPortion("");
    setClassName("");
    setBoard("");
    setDuration("");
    setRegistrationEndDate("");
    setWritingAllowedTill("");
    setEditingTestCode("");
    setChapter("");
  }

  function editTest(t) {
    setEditingTestCode(t.test_code);
    setTestCode(t.test_code || "");
    setSubject(String(t.subject_id || ""));
    setDate(toInputDate(t.test_date));
    setMarks(String(t.total_marks || ""));
    setPortion(t.portion || "");
    setClassName(t.class || "");
    setBoard(t.board || "");
    setDuration(String(t.duration_minutes || ""));
    setChapter(t.chapter || "");
    setRegistrationEndDate(toInputDate(t.registration_end_date));
    setWritingAllowedTill(toInputDate(t.writing_allowed_till));

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateForm() {
    const today = new Date().toISOString().split("T")[0];

    if (!facultyId) {
      alert("Faculty ID missing. Please login again.");
      return false;
    }

    if (!testCode.trim()) {
      alert("Enter test code");
      return false;
    }

    if (!subject) {
      alert("Select subject");
      return false;
    }

    if (!date) {
      alert("Select test date");
      return false;
    }

    if (date < today) {
      alert("Past test dates are not allowed");
      return false;
    }

    if (!marks || Number(marks) <= 0) {
      alert("Enter valid total marks");
      return false;
    }

    if (!className || !board) {
      alert("Select class");
      return false;
    }

    if (!duration) {
      alert("Select duration");
      return false;
    }
    if (!chapter.trim()) {
  alert("Enter chapter");
  return false;
}

    if (!registrationEndDate) {
      alert("Select link active till date");
      return false;
    }

    if (!writingAllowedTill) {
      alert("Select test writing allowed till date");
      return false;
    }

    if (registrationEndDate >= date) {
      alert("Link active till date must be before test date");
      return false;
    }

    if (writingAllowedTill < date) {
      alert("Writing allowed till date cannot be before test date");
      return false;
    }

    return true;
  }

  async function saveTest() {
    if (saving) return;
    if (!validateForm()) return;

    try {
      setSaving(true);

      const url = editingTestCode
        ? `${API_BASE}/posted-tests/${encodeURIComponent(editingTestCode)}`
        : `${API_BASE}/post-test`;

      const method = editingTestCode ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test_code: testCode.trim().toUpperCase(),
          subject_id: Number(subject),
          test_date: date,
          total_marks: Number(marks),
          portion: portion.trim(),

          chapter:
    chapter.trim().toLowerCase() === "combined"
      ? "combined"
      : chapter.trim(),

          created_by: facultyId,
          class_name: className,
          board,
          duration_minutes: Number(duration),
          registration_end_date: registrationEndDate,
          writing_allowed_till: writingAllowedTill,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || data.details || "Failed to save test");
        return;
      }

      alert(editingTestCode ? "Test updated successfully" : "Test posted successfully");
      resetForm();
      await loadPostedTests();
setCurrentPage(1);
    } catch (err) {
      console.error("Save test error:", err);
      alert("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const filteredTests = [...postedTests]
  .sort((a, b) => new Date(b.test_date) - new Date(a.test_date))
  .filter((t) =>
    t.test_code?.toLowerCase().includes(searchCode.toLowerCase())
  );

const totalPages = Math.ceil(filteredTests.length / testsPerPage);

const currentTests = filteredTests.slice(
  (currentPage - 1) * testsPerPage,
  currentPage * testsPerPage
);

async function deleteTest(code) {
    if (!window.confirm(`Delete test ${code}?`)) return;

    try {
      const res = await fetch(`${API_BASE}/posted-tests/${encodeURIComponent(code)}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Delete failed");
        return;
      }

      alert("Deleted successfully");
      await loadPostedTests();

      if (editingTestCode === code) resetForm();
    } catch (err) {
      console.error("Delete test error:", err);
      alert("Delete failed");
    }
  }

  return (
    <div className="p-6 md:p-10 bg-gray-50 min-h-screen">
      <h1 className="text-2xl md:text-3xl font-bold text-blue-800 mb-8">
        Post Test
      </h1>

      <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <input
  placeholder="Test Code (Example: S12M50C12)"
  value={testCode}
  onChange={(e) => {
    const value = e.target.value.toUpperCase();

    setTestCode(value);

    const extractedMarks = extractMarksFromTestCode(value);

    if (extractedMarks) {
      setMarks(extractedMarks);
    }
  }}
  className="border rounded-lg px-4 py-3 text-gray-700"
  readOnly={!!editingTestCode}
/>

          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="border rounded-lg px-4 py-3 text-gray-700 bg-white"
          >
            <option value="">Select Subject</option>
            <option value="1">Maths</option>
            <option value="2">Physics</option>
          </select>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded-lg px-4 py-3 text-gray-700"
          />

          <input
            type="number"
            placeholder="Total Marks"
            value={marks}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "" || /^\d+$/.test(value)) setMarks(value);
            }}
            className="border rounded-lg px-4 py-3 text-gray-700"
          />

          <input
            placeholder="Portion"
            value={portion}
            onChange={(e) => setPortion(e.target.value)}
            className="border rounded-lg px-4 py-3 text-gray-700"
          />
          <input
  placeholder="Chapter"
  value={chapter}
  onChange={(e) => setChapter(e.target.value)}
  className="border rounded-lg px-4 py-3 text-gray-700"
/>

          <select
            value={className ? `${className}||${board}` : ""}
            onChange={handleClassChange}
            className="border rounded-lg px-4 py-3 text-gray-700 bg-white"
          >
            <option value="">Select Class</option>
            {classes.map((c, i) => (
              <option key={`${c.class}-${c.board}-${i}`} value={`${c.class}||${c.board}`}>
                {c.class} — {c.board}
              </option>
            ))}
          </select>

          <input
            placeholder="Board"
            value={board}
            readOnly
            className="border rounded-lg px-4 py-3 bg-gray-100 text-gray-700"
          />

          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="border rounded-lg px-4 py-3 text-gray-700 bg-white"
          >
            <option value="">Duration (minutes)</option>
            <option value="90">90 mins</option>
            <option value="180">180 mins</option>
          </select>

          <div>
            <label className="block text-sm font-semibold text-blue-700 mb-2">
              Link Active Till Date
            </label>
            <input
              type="date"
              value={registrationEndDate}
              onChange={(e) => setRegistrationEndDate(e.target.value)}
              className="border rounded-lg px-4 py-3 text-gray-700 w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-blue-700 mb-2">
              Test Writing Allowed Till Date
            </label>
            <input
              type="date"
              value={writingAllowedTill}
              onChange={(e) => setWritingAllowedTill(e.target.value)}
              className="border rounded-lg px-4 py-3 text-gray-700 w-full"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={saveTest}
            disabled={saving}
            className="w-full bg-blue-700 text-white py-3 rounded-lg hover:bg-blue-800 disabled:bg-gray-400"
          >
            {saving
              ? "Saving..."
              : editingTestCode
              ? "Update Test"
              : "Create Test"}
          </button>

          {editingTestCode && (
            <button
              onClick={resetForm}
              disabled={saving}
              className="px-6 bg-gray-500 text-white py-3 rounded-lg hover:bg-gray-600 disabled:bg-gray-400"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="mt-10">
        <h2 className="text-xl font-bold text-blue-800 mb-5">Posted Tests</h2>

<div className="mb-4">
  <input
    type="text"
    placeholder="Search by Test Code"
    value={searchCode}
    onChange={(e) => {
      setSearchCode(e.target.value);
      setCurrentPage(1);
    }}
    className="border rounded-lg px-4 py-2 w-full md:w-80"
  />
</div>

        <div className="bg-white shadow-md rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-blue-700 text-white">
              <tr>
                <th className="p-3">Code</th>
                <th className="p-3">Subject</th>
                <th className="p-3">Date</th>
                <th className="p-3">Marks</th>
                <th className="p-3">Class</th>
                <th className="p-3">Board</th>
                <th className="p-3">Duration</th>
                <th className="p-3">By</th>
              <th className="p-3">Portion</th>
<th className="p-3">Chapter</th>
<th className="p-3">Action</th>
              </tr>
            </thead>

            <tbody>
              {currentTests.map((t) => (
                <tr key={t.test_code} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-blue-700 font-semibold">
                    {t.test_code}
                  </td>
                  <td className="p-3">{t.subject_name || "-"}</td>
                  <td className="p-3">{formatDate(t.test_date)}</td>
                  <td className="p-3">{t.total_marks ?? "-"}</td>
                  <td className="p-3">{t.class || "-"}</td>
                  <td className="p-3">{t.board || "-"}</td>
                  <td className="p-3">
                    {t.duration_minutes ? `${t.duration_minutes} mins` : "-"}
                  </td>
                  <td className="p-3">{t.created_by || "-"}</td>
                  <td className="p-3">{t.portion || "-"}</td>
                  <td className="p-3">{t.chapter || "-"}</td>

                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => editTest(t)}
                        className="bg-yellow-500 text-white px-3 py-1 rounded-lg hover:bg-yellow-600"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => deleteTest(t.test_code)}
                        className="bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {currentTests.length === 0 && (
                <tr>
                  <td colSpan="10" className="p-5 text-center text-gray-500">
                    No posted tests found
                  </td>
                </tr>
              )}
            </tbody>
         </table>
</div>

<div className="flex justify-center items-center gap-2 mt-5">
  <button
    disabled={currentPage === 1}
    onClick={() => setCurrentPage((p) => p - 1)}
    className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
  >
    Prev
  </button>

  <span className="font-semibold">
    Page {currentPage} of {totalPages || 1}
  </span>

  <button
    disabled={currentPage === totalPages || totalPages === 0}
    onClick={() => setCurrentPage((p) => p + 1)}
    className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
  >
    Next
  </button>
</div>
      </div>
    </div>
  );
}

export default function PostTest() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <PostTestInner />
    </Suspense>
  );
}