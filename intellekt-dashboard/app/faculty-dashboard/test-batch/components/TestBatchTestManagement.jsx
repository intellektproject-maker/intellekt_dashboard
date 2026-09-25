"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://responsible-wonder-production.up.railway.app";

const ADMIN_IDS = ["IG001", "IG002"];

async function api(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function Card({ children, className = "" }) {
  return (
    <div
      className={
        "bg-white shadow-md rounded-xl border border-gray-200 p-6 " +
        className
      }
    >
      {children}
    </div>
  );
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-IN");
}

function normalizeStudent(row) {
  return {
    ...row,
    marks_obtained:
      row.marks_obtained === null || row.marks_obtained === undefined
        ? ""
        : String(row.marks_obtained),
    remarks:
      row.remarks === null || row.remarks === undefined
        ? ""
        : String(row.remarks),
  };
}

export default function TestBatchTestManagement() {
  const params = useSearchParams();
  const adminId = (params.get("id") || "").toUpperCase().trim();

  const [tests, setTests] = useState([]);
  const [eligibleTests, setEligibleTests] = useState([]);
  const [section, setSection] = useState("");

  const [selectedMarkTest, setSelectedMarkTest] = useState("");
  const [markTest, setMarkTest] = useState(null);
  const [students, setStudents] = useState([]);
  const [originalStudents, setOriginalStudents] = useState([]);

  const [editingTest, setEditingTest] = useState(null);
  const [settingsForm, setSettingsForm] = useState({
    status: "Scheduled",
    total_marks: "",
    test_date: "",
    writing_date: "",
    slot_start: "",
    slot_end: "",
    duration_minutes: "",
    portion: "",
    chapter: "",
    application_open_date: "",
    application_close_date: "",
  });

  const [resultTest, setResultTest] = useState("");
  const [results, setResults] = useState([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMarks, setLoadingMarks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const authorized = ADMIN_IDS.includes(adminId);

  async function loadTests() {
    setLoading(true);

    try {
      const query = new URLSearchParams({ adminId });

      if (search.trim()) {
        query.set("search", search.trim());
      }

      const data = await api("/test-batch/tests?" + query.toString());
      setTests(data.tests || []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadEligibleTests() {
    try {
      const data = await api(
        "/test-batch/mark-entry/tests?adminId=" +
          encodeURIComponent(adminId)
      );
      setEligibleTests(data.tests || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadMarkEntry(testCode) {
    if (!testCode) {
      setMarkTest(null);
      setStudents([]);
      setOriginalStudents([]);
      return;
    }

    setLoadingMarks(true);
    setError("");
    setMessage("");

    try {
      const data = await api(
        "/test-batch/tests/" +
          encodeURIComponent(testCode) +
          "/mark-entry?adminId=" +
          encodeURIComponent(adminId)
      );

      const loaded = (data.students || []).map(normalizeStudent);

      setMarkTest(data.test || null);
      setStudents(loaded);
      setOriginalStudents(JSON.parse(JSON.stringify(loaded)));
    } catch (err) {
      setMarkTest(null);
      setStudents([]);
      setOriginalStudents([]);
      setError(err.message);
    } finally {
      setLoadingMarks(false);
    }
  }

  async function loadResults(code) {
    if (!code) {
      setResults([]);
      return;
    }

    try {
      const data = await api(
        "/test-batch/tests/" +
          encodeURIComponent(code) +
          "/results?adminId=" +
          encodeURIComponent(adminId)
      );

      setResults(data.results || []);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!authorized) return;

    loadTests();
    loadEligibleTests();
  }, [adminId, authorized, search]);

  useEffect(() => {
    if (section === "mark-entry" && selectedMarkTest) {
      loadMarkEntry(selectedMarkTest);
    }
  }, [section, selectedMarkTest]);

  useEffect(() => {
    if (section === "results") {
      loadResults(resultTest);
    }
  }, [section, resultTest]);

  function updateStudent(rollNo, field, value) {
    setStudents((current) =>
      current.map((student) =>
        student.roll_no === rollNo
          ? { ...student, [field]: value }
          : student
      )
    );
    setMessage("");
  }

  function resetUnsavedChanges() {
    setStudents(JSON.parse(JSON.stringify(originalStudents)));
    setMessage("Unsaved mark changes were reverted.");
    setError("");
  }

  async function saveMarks() {
    if (!markTest || markTest.marks_entry_status === "Finalized") return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await api(
        "/test-batch/tests/" +
          encodeURIComponent(markTest.test_code) +
          "/marks",
        {
          method: "POST",
          body: JSON.stringify({
            adminId,
            records: students.map((student) => ({
              roll_no: student.roll_no,
              marks_obtained: student.marks_obtained,
              remarks: student.remarks,
            })),
          }),
        }
      );

      await loadMarkEntry(markTest.test_code);
      await loadTests();
      await loadEligibleTests();
      setMessage("Test Batch marks saved successfully. You can still update them before finalization.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function resetSavedDraft() {
    if (!markTest || markTest.marks_entry_status === "Finalized") return;

    const confirmed = window.confirm(
      "Reset all saved draft marks for " +
        markTest.test_code +
        "? This will clear the saved marks before finalization."
    );

    if (!confirmed) return;

    setResetting(true);
    setError("");
    setMessage("");

    try {
      await api(
        "/test-batch/tests/" +
          encodeURIComponent(markTest.test_code) +
          "/marks/draft?adminId=" +
          encodeURIComponent(adminId),
        {
          method: "DELETE",
        }
      );

      await loadMarkEntry(markTest.test_code);
      await loadTests();
      await loadEligibleTests();
      setMessage("Saved draft marks were reset.");
    } catch (err) {
      setError(err.message);
    } finally {
      setResetting(false);
    }
  }

  async function finalizeMarks() {
    if (!markTest || markTest.marks_entry_status === "Finalized") return;

    const missing = students.filter(
      (student) => !String(student.marks_obtained || "").trim()
    );

    if (missing.length) {
      setError(
        "Enter marks for all appeared students before finalizing: " +
          missing.map((student) => student.roll_no).join(", ")
      );
      return;
    }

    const confirmed = window.confirm(
      "Finalize marks for " +
        markTest.test_code +
        "? Finalized marks will be locked from further editing."
    );

    if (!confirmed) return;

    setFinalizing(true);
    setError("");
    setMessage("");

    try {
      await api(
        "/test-batch/tests/" +
          encodeURIComponent(markTest.test_code) +
          "/marks/finalize",
        {
          method: "POST",
          body: JSON.stringify({ adminId }),
        }
      );

      await loadMarkEntry(markTest.test_code);
      await loadTests();
      await loadEligibleTests();
      setMessage(
        "Marks finalized successfully. They are now available to Test Batch result/student views."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setFinalizing(false);
    }
  }

  function openSettings(test) {
    setEditingTest(test);

    const dateOnly = (value) => String(value || "").slice(0, 10);

    setSettingsForm({
      status: test.status || "Scheduled",
      total_marks: test.total_marks || "",
      test_date: dateOnly(test.test_date),
      writing_date: dateOnly(test.writing_date),
      slot_start: test.slot_start || "",
      slot_end: test.slot_end || "",
      duration_minutes: test.duration_minutes || "",
      portion: test.portion || "",
      chapter: test.chapter || "",
      application_open_date: dateOnly(test.application_open_date),
      application_close_date: dateOnly(test.application_close_date),
    });

    setSection("settings");
    setError("");
    setMessage("");
  }

  function updateSettings(field, value) {
    setSettingsForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveSettings(event) {
    event.preventDefault();

    if (!editingTest) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await api("/test-batch/tests/" + editingTest.id, {
        method: "PUT",
        body: JSON.stringify({
          adminId,
          test_code: editingTest.test_code,
          test_series_id: editingTest.test_series_id,
          subject_name: editingTest.subject_name,
          ...settingsForm,
          duration_minutes: Number(settingsForm.duration_minutes),
          total_marks: Number(settingsForm.total_marks),
        }),
      });

      await loadTests();
      await loadEligibleTests();
      setSection("list");
      setEditingTest(null);
      setMessage("Test Batch test settings updated successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTest(test) {
    const confirmed = window.confirm(
      "Delete Test Batch test " + test.test_code + "?"
    );

    if (!confirmed) return;

    try {
      await api("/test-batch/tests/" + test.id, {
        method: "DELETE",
        body: JSON.stringify({ adminId }),
      });

      await loadTests();
      await loadEligibleTests();
      setMessage("Test Batch test deleted successfully.");
    } catch (err) {
      setError(err.message);
    }
  }

  function exportTests() {
    if (!filteredTests.length) {
      window.alert("No Test Batch tests to export.");
      return;
    }

    const rows = filteredTests
      .map(
        (test) =>
          "<tr>" +
          "<td>" +
          test.test_code +
          "</td><td>" +
          test.test_series_name +
          "</td><td>" +
          test.subject_name +
          "</td><td>" +
          formatDate(test.test_date) +
          "</td><td>" +
          formatDate(test.writing_date) +
          "</td><td>" +
          test.total_marks +
          "</td><td>" +
          test.status +
          "</td><td>" +
          test.marks_entry_status +
          "</td></tr>"
      )
      .join("");

    const html =
      "<table border='1'><tr><th>Test Code</th><th>Test Batch</th><th>Subject</th><th>Test Date</th><th>Writing Date</th><th>Total Marks</th><th>Status</th><th>Marks Status</th></tr>" +
      rows +
      "</table>";

    const blob = new Blob([html], {
      type: "application/vnd.ms-excel",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "test_batch_test_list.xls";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const filteredTests = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return tests;

    return tests.filter(
      (test) =>
        String(test.test_code).toLowerCase().includes(term) ||
        String(test.subject_name).toLowerCase().includes(term) ||
        String(test.test_series_name).toLowerCase().includes(term)
    );
  }, [tests, search]);

  const markStatusLabel = useMemo(() => {
    if (!markTest) return "";
    if (markTest.marks_entry_status === "Finalized") return "Finalized";
    if (markTest.marks_entry_status === "Draft") return "Draft - Editable";
    return "Pending";
  }, [markTest]);

  if (!authorized) return null;

  return (
    <div className="mt-12 border-t-4 border-blue-700 pt-8 space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-blue-800">
          Test Batch
        </h2>
        <p className="text-gray-600 mt-2">
          Test management dedicated exclusively to Test Batch students.
          Regular Student tests remain unchanged.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <button
          onClick={() => {
            setSection("mark-entry");
            setError("");
            setMessage("");
          }}
          className="text-left bg-white shadow-md rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:scale-[1.02] transition"
        >
          <h3 className="text-lg font-semibold text-blue-700 mb-2">
            Test Batch – Enter Marks
          </h3>
          <p className="text-gray-600">
            Select a completed or returned test and enter marks for students
            who appeared.
          </p>
        </button>

        <button
          onClick={() => {
            setSection("list");
            setError("");
            setMessage("");
          }}
          className="text-left bg-white shadow-md rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:scale-[1.02] transition"
        >
          <h3 className="text-lg font-semibold text-blue-700 mb-2">
            Test Batch – Test List
          </h3>
          <p className="text-gray-600">
            View, search, edit and export Test Batch tests.
          </p>
        </button>

        <button
          onClick={() => {
            setSection("settings");
            setEditingTest(null);
            setError("");
            setMessage("");
          }}
          className="text-left bg-white shadow-md rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:scale-[1.02] transition"
        >
          <h3 className="text-lg font-semibold text-blue-700 mb-2">
            Test Batch – Test Settings
          </h3>
          <p className="text-gray-600">
            Update existing Test Batch test date, status, marks and settings.
          </p>
        </button>

        <button
          onClick={() => {
            setSection("results");
            setError("");
            setMessage("");
          }}
          className="text-left bg-white shadow-md rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:scale-[1.02] transition"
        >
          <h3 className="text-lg font-semibold text-blue-700 mb-2">
            Test Batch – Results
          </h3>
          <p className="text-gray-600">
            View saved marks for Test Batch students.
          </p>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
          {error}
        </div>
      )}

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4">
          {message}
        </div>
      )}

      {section === "mark-entry" && (
        <Card>
          <div className="flex flex-wrap items-start gap-4 justify-between mb-5">
            <div>
              <h3 className="text-xl font-bold text-blue-800">
                Test Batch – Enter Marks
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Only completed or returned tests are available. Students are
                loaded only when their Test Batch attendance is marked Present
                for the test writing date.
              </p>
            </div>
            <button
              onClick={() => {
                setSection("");
                setSelectedMarkTest("");
                setMarkTest(null);
                setStudents([]);
              }}
              className="px-4 py-2 bg-gray-100 rounded-lg"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="lg:col-span-2">
              <label className="text-sm text-gray-600">
                Select Completed / Returned Test
                <select
                  className="block w-full border rounded-lg px-4 py-3 mt-1 bg-white"
                  value={selectedMarkTest}
                  onChange={(event) =>
                    setSelectedMarkTest(event.target.value)
                  }
                >
                  <option value="">Select Test</option>
                  {eligibleTests.map((test) => (
                    <option key={test.test_code} value={test.test_code}>
                      {test.test_code} — {test.test_series_name} —{" "}
                      {test.subject_name} — {formatDate(test.writing_date)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="bg-gray-50 border rounded-lg px-4 py-3">
              <div className="text-xs text-gray-500">Marks Entry Status</div>
              <div className="font-semibold text-blue-800 mt-1">
                {markStatusLabel || "Select a test"}
              </div>
            </div>
          </div>

          {!selectedMarkTest ? (
            <div className="border border-dashed rounded-lg p-8 text-center text-gray-500">
              Select a completed or returned Test Batch test to load the
              students who appeared.
            </div>
          ) : loadingMarks ? (
            <p className="text-gray-500">Loading students...</p>
          ) : !markTest ? (
            <p className="text-gray-500">Unable to load the selected test.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Test Code</div>
                  <div className="font-semibold">{markTest.test_code}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Test Batch</div>
                  <div className="font-semibold">
                    {markTest.test_series_name}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Subject</div>
                  <div className="font-semibold">{markTest.subject_name}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Writing Date</div>
                  <div className="font-semibold">
                    {formatDate(markTest.writing_date)}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Max Marks</div>
                  <div className="font-semibold">{markTest.total_marks}</div>
                </div>
              </div>

              {students.length === 0 ? (
                <div className="border border-dashed rounded-lg p-8 text-center text-gray-500">
                  No Test Batch students are marked Present for this test.
                  Mark attendance first for students who appeared.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full min-w-[950px]">
                      <thead className="bg-blue-700 text-white">
                        <tr>
                          <th className="p-3 text-left">Student Name</th>
                          <th className="p-3 text-left">Roll No</th>
                          <th className="p-3 text-left">Marks Obtained</th>
                          <th className="p-3 text-left">Max Marks</th>
                          <th className="p-3 text-left">Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((student, index) => {
                          const locked =
                            markTest.marks_entry_status === "Finalized";

                          return (
                            <tr
                              key={student.roll_no}
                              className={
                                index % 2 === 0
                                  ? "bg-gray-50 border-b"
                                  : "border-b"
                              }
                            >
                              <td className="p-3 font-medium">
                                {student.name}
                              </td>
                              <td className="p-3 font-semibold text-blue-700">
                                {student.roll_no}
                              </td>
                              <td className="p-3">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="w-full max-w-[180px] border rounded-lg px-3 py-2 disabled:bg-gray-100"
                                  placeholder="Marks / A"
                                  value={student.marks_obtained}
                                  disabled={locked}
                                  onChange={(event) =>
                                    updateStudent(
                                      student.roll_no,
                                      "marks_obtained",
                                      event.target.value
                                    )
                                  }
                                />
                              </td>
                              <td className="p-3">{markTest.total_marks}</td>
                              <td className="p-3">
                                <input
                                  type="text"
                                  className="w-full border rounded-lg px-3 py-2 disabled:bg-gray-100"
                                  placeholder="Remarks"
                                  value={student.remarks}
                                  disabled={locked}
                                  onChange={(event) =>
                                    updateStudent(
                                      student.roll_no,
                                      "remarks",
                                      event.target.value
                                    )
                                  }
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap gap-3 items-center mt-5">
                    <button
                      onClick={saveMarks}
                      disabled={
                        saving ||
                        finalizing ||
                        markTest.marks_entry_status === "Finalized"
                      }
                      className="bg-blue-700 text-white px-6 py-3 rounded-lg disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save / Update Marks"}
                    </button>

                    <button
                      onClick={resetUnsavedChanges}
                      disabled={
                        saving ||
                        finalizing ||
                        markTest.marks_entry_status === "Finalized"
                      }
                      className="bg-gray-500 text-white px-6 py-3 rounded-lg disabled:opacity-50"
                    >
                      Revert Unsaved Changes
                    </button>

                    <button
                      onClick={resetSavedDraft}
                      disabled={
                        resetting ||
                        saving ||
                        finalizing ||
                        markTest.marks_entry_status === "Finalized"
                      }
                      className="bg-orange-600 text-white px-6 py-3 rounded-lg disabled:opacity-50"
                    >
                      {resetting ? "Resetting..." : "Reset Saved Draft"}
                    </button>

                    <button
                      onClick={finalizeMarks}
                      disabled={
                        saving ||
                        finalizing ||
                        resetting ||
                        markTest.marks_entry_status === "Finalized"
                      }
                      className="bg-green-700 text-white px-6 py-3 rounded-lg disabled:opacity-50"
                    >
                      {finalizing ? "Finalizing..." : "Finalize Marks"}
                    </button>

                    {markTest.marks_entry_status === "Finalized" && (
                      <span className="text-sm font-semibold text-green-700">
                        Finalized and locked
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mt-3">
                    Leave a marks field blank to clear that saved draft mark.
                    Enter A for an absent result if required by the mark sheet.
                  </p>
                </>
              )}
            </>
          )}
        </Card>
      )}

      {section === "list" && (
        <Card>
          <div className="flex flex-wrap gap-3 items-center mb-5">
            <h3 className="text-xl font-bold text-blue-800 mr-auto">
              Test Batch – Test List
            </h3>
            <input
              className="border rounded-lg px-4 py-2"
              placeholder="Search test code / subject / batch"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              onClick={exportTests}
              className="bg-gray-700 text-white px-5 py-2 rounded-lg"
            >
              Export
            </button>
          </div>

          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : filteredTests.length === 0 ? (
            <p className="text-gray-500">No Test Batch tests found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <thead className="bg-blue-700 text-white">
                  <tr>
                    <th className="p-3 text-left">Code</th>
                    <th className="p-3 text-left">Test Batch</th>
                    <th className="p-3 text-left">Subject</th>
                    <th className="p-3 text-left">Test Date</th>
                    <th className="p-3 text-left">Writing Date</th>
                    <th className="p-3 text-left">Marks</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Marks Status</th>
                    <th className="p-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTests.map((test, index) => (
                    <tr
                      key={test.id}
                      className={
                        index % 2 === 0 ? "bg-gray-50 border-b" : "border-b"
                      }
                    >
                      <td className="p-3 font-semibold text-blue-700">
                        {test.test_code}
                      </td>
                      <td className="p-3">{test.test_series_name}</td>
                      <td className="p-3">{test.subject_name}</td>
                      <td className="p-3">{formatDate(test.test_date)}</td>
                      <td className="p-3">{formatDate(test.writing_date)}</td>
                      <td className="p-3">{test.total_marks}</td>
                      <td className="p-3">{test.status}</td>
                      <td className="p-3">{test.marks_entry_status}</td>
                      <td className="p-3 flex gap-2">
                        <button
                          onClick={() => openSettings(test)}
                          className="bg-yellow-500 text-white px-3 py-1 rounded"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteTest(test)}
                          className="bg-red-600 text-white px-3 py-1 rounded"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {section === "settings" && (
        <Card>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h3 className="text-xl font-bold text-blue-800">
                Test Batch – Test Settings
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Select an existing Test Batch test to update its settings.
              </p>
            </div>
            <button
              onClick={() => {
                setSection("");
                setEditingTest(null);
              }}
              className="px-4 py-2 bg-gray-100 rounded-lg"
            >
              Close
            </button>
          </div>

          {!editingTest ? (
            <div>
              <label className="text-sm text-gray-600">
                Select Test
                <select
                  className="block w-full border rounded-lg px-4 py-3 mt-1 bg-white"
                  value=""
                  onChange={(event) => {
                    const test = tests.find(
                      (item) => String(item.id) === event.target.value
                    );
                    if (test) openSettings(test);
                  }}
                >
                  <option value="">Select Test to Edit</option>
                  {tests.map((test) => (
                    <option key={test.id} value={test.id}>
                      {test.test_code} — {test.test_series_name} —{" "}
                      {test.subject_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <form
              onSubmit={saveSettings}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <div className="md:col-span-2 bg-gray-50 border rounded-lg p-4">
                <div className="text-xs text-gray-500">Test</div>
                <div className="font-semibold text-blue-800">
                  {editingTest.test_code} — {editingTest.test_series_name} —{" "}
                  {editingTest.subject_name}
                </div>
              </div>

              <select
                className="border rounded-lg px-4 py-3 bg-white"
                value={settingsForm.status}
                onChange={(event) =>
                  updateSettings("status", event.target.value)
                }
              >
                <option>Draft</option>
                <option>Scheduled</option>
                <option>Active</option>
                <option>Completed</option>
                <option>Returned</option>
                <option>Cancelled</option>
              </select>

              <input
                type="number"
                min="1"
                className="border rounded-lg px-4 py-3"
                placeholder="Total Marks"
                value={settingsForm.total_marks}
                onChange={(event) =>
                  updateSettings("total_marks", event.target.value)
                }
              />

              <label className="text-sm text-gray-600">
                Test Date
                <input
                  type="date"
                  className="block w-full border rounded-lg px-4 py-3 mt-1"
                  value={settingsForm.test_date}
                  onChange={(event) =>
                    updateSettings("test_date", event.target.value)
                  }
                />
              </label>

              <label className="text-sm text-gray-600">
                Writing Date
                <input
                  type="date"
                  className="block w-full border rounded-lg px-4 py-3 mt-1"
                  value={settingsForm.writing_date}
                  onChange={(event) =>
                    updateSettings("writing_date", event.target.value)
                  }
                />
              </label>

              <label className="text-sm text-gray-600">
                Test Slot Start
                <input
                  type="time"
                  className="block w-full border rounded-lg px-4 py-3 mt-1"
                  value={settingsForm.slot_start}
                  onChange={(event) =>
                    updateSettings("slot_start", event.target.value)
                  }
                />
              </label>

              <label className="text-sm text-gray-600">
                Test Slot End
                <input
                  type="time"
                  className="block w-full border rounded-lg px-4 py-3 mt-1"
                  value={settingsForm.slot_end}
                  onChange={(event) =>
                    updateSettings("slot_end", event.target.value)
                  }
                />
              </label>

              <input
                type="number"
                min="1"
                className="border rounded-lg px-4 py-3"
                placeholder="Duration (minutes)"
                value={settingsForm.duration_minutes}
                onChange={(event) =>
                  updateSettings("duration_minutes", event.target.value)
                }
              />

              <input
                className="border rounded-lg px-4 py-3"
                placeholder="Portion"
                value={settingsForm.portion}
                onChange={(event) =>
                  updateSettings("portion", event.target.value)
                }
              />

              <input
                className="border rounded-lg px-4 py-3"
                placeholder="Chapter"
                value={settingsForm.chapter}
                onChange={(event) =>
                  updateSettings("chapter", event.target.value)
                }
              />

              <label className="text-sm text-gray-600">
                Apply for Test – Open Date
                <input
                  type="date"
                  className="block w-full border rounded-lg px-4 py-3 mt-1"
                  value={settingsForm.application_open_date}
                  onChange={(event) =>
                    updateSettings(
                      "application_open_date",
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="text-sm text-gray-600">
                Apply for Test – Close Date
                <input
                  type="date"
                  className="block w-full border rounded-lg px-4 py-3 mt-1"
                  value={settingsForm.application_close_date}
                  onChange={(event) =>
                    updateSettings(
                      "application_close_date",
                      event.target.value
                    )
                  }
                />
              </label>

              <div className="md:col-span-2 flex gap-3">
                <button
                  disabled={saving}
                  className="bg-blue-700 text-white px-6 py-3 rounded-lg disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Update Test Settings"}
                </button>

                <button
                  type="button"
                  onClick={() => setEditingTest(null)}
                  className="bg-gray-500 text-white px-6 py-3 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </Card>
      )}

      {section === "results" && (
        <Card>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h3 className="text-xl font-bold text-blue-800">
                Test Batch – Results
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Results are read from the isolated Test Batch marks table.
              </p>
            </div>
            <button
              onClick={() => setSection("")}
              className="px-4 py-2 bg-gray-100 rounded-lg"
            >
              Close
            </button>
          </div>

          <div className="flex gap-3 mb-5">
            <select
              className="border rounded-lg px-4 py-3 flex-1 bg-white"
              value={resultTest}
              onChange={(event) => setResultTest(event.target.value)}
            >
              <option value="">Select Test</option>
              {tests.map((test) => (
                <option key={test.test_code} value={test.test_code}>
                  {test.test_code} — {test.test_series_name} —{" "}
                  {test.subject_name}
                </option>
              ))}
            </select>
          </div>

          {!resultTest ? (
            <p className="text-gray-500">
              Select a Test Batch test to view results.
            </p>
          ) : results.length === 0 ? (
            <p className="text-gray-500">No marks found for this Test Batch test.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="bg-blue-700 text-white">
                  <tr>
                    <th className="p-3 text-left">Roll No</th>
                    <th className="p-3 text-left">Student</th>
                    <th className="p-3 text-left">Subject</th>
                    <th className="p-3 text-left">Marks</th>
                    <th className="p-3 text-left">Total</th>
                    <th className="p-3 text-left">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, index) => {
                    const absent =
                      String(result.marks_obtained).toUpperCase() === "A";
                    const percentage = absent
                      ? null
                      : (Number(result.marks_obtained) /
                          Number(result.total_marks)) *
                        100;

                    return (
                      <tr
                        key={result.id}
                        className={
                          index % 2 === 0
                            ? "bg-gray-50 border-b"
                            : "border-b"
                        }
                      >
                        <td className="p-3 font-semibold">
                          {result.roll_no}
                        </td>
                        <td className="p-3">{result.name}</td>
                        <td className="p-3">{result.subject_name}</td>
                        <td className="p-3">{result.marks_obtained}</td>
                        <td className="p-3">{result.total_marks}</td>
                        <td className="p-3">
                          {absent
                            ? "Absent"
                            : percentage >= 40
                            ? "Pass"
                            : "Fail"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
