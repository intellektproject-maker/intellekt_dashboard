"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

export default function TestBatchTestManagement({ initialSection = "", standalone = false } = {}) {
  const router = useRouter();
  const params = useSearchParams();
  const adminId = (params.get("id") || "").toUpperCase().trim();

  const [tests, setTests] = useState([]);
  const [eligibleTests, setEligibleTests] = useState([]);
  const [testSeries, setTestSeries] = useState([]);
  const [section, setSection] = useState(initialSection);

  const [scheduleForm, setScheduleForm] = useState({
    test_code: "",
    test_series_id: "",
    subject_name: "",
    test_date: "",
    writing_date: "",
    slot_start: "",
    slot_end: "",
    duration_minutes: "",
    total_marks: "",
    portion: "",
    chapter: "",
    application_open_date: "",
    application_close_date: "",
    status: "Scheduled",
  });

  const [selectedMarkTest, setSelectedMarkTest] = useState("");
  const [markSeriesFilter, setMarkSeriesFilter] = useState("");
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

  const [registeredStudentTest, setRegisteredStudentTest] = useState("");
  const [registeredStudents, setRegisteredStudents] = useState([]);
  const [loadingRegisteredStudents, setLoadingRegisteredStudents] = useState(false);
  const [postTestTests, setPostTestTests] = useState([]);
  const [selectedPostTest, setSelectedPostTest] = useState("");
  const [postTest, setPostTest] = useState(null);
  const [postTestForm, setPostTestForm] = useState({
    manual_mark_entry_enabled: true,
    bulk_mark_upload_enabled: false,
    passing_percentage: 40,
    grade_boundaries: { A: 90, B: 75, C: 60, D: 40 },
    result_publication_mode: "approval",
    show_detailed_breakdown: false,
    reevaluation_enabled: false,
    lock_marks_after_final_submission: true,
    post_test_export_enabled: true,
  });
  const [loadingPostTest, setLoadingPostTest] = useState(false);


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

  async function loadTestSeries() {
    try {
      const data = await api(
        "/test-batch/series?adminId=" + encodeURIComponent(adminId)
      );
      setTestSeries(data.series || []);
    } catch (err) {
      setTestSeries([]);
      setError(err.message);
    }
  }

  function resetScheduleForm() {
    setScheduleForm({
      test_code: "",
      test_series_id: "",
      subject_name: "",
      test_date: "",
      writing_date: "",
      slot_start: "",
      slot_end: "",
      duration_minutes: "",
      total_marks: "",
      portion: "",
      chapter: "",
      application_open_date: "",
      application_close_date: "",
      status: "Scheduled",
    });
  }

  function updateSchedule(field, value) {
    setScheduleForm((current) => ({ ...current, [field]: value }));
    setError("");
    setMessage("");
  }

  function openPostTestScheduler(test = null) {
    if (test) {
      const dateOnly = (value) => String(value || "").slice(0, 10);
      setScheduleForm({
        id: test.id,
        test_code: test.test_code || "",
        test_series_id: String(test.test_series_id || ""),
        subject_name: test.subject_name || "",
        duration_minutes: test.duration_minutes || "",
        total_marks: test.total_marks || "",
        portion: test.portion || "",
        chapter: test.chapter || "",
        application_open_date: dateOnly(test.application_open_date),
        application_close_date: dateOnly(test.application_close_date),
        status: test.status || "Scheduled",
      });
    } else {
      resetScheduleForm();
    }

    setSection("schedule");
    setError("");
    setMessage("");
  }

  async function saveScheduledTest(event) {
    event.preventDefault();

    const form = scheduleForm;
    if (!form.test_code.trim()) return setError("Enter test code.");
    if (!form.test_series_id) return setError("Select Test Batch / Series.");
    if (!form.subject_name.trim()) return setError("Enter subject.");
    if (!form.total_marks || Number(form.total_marks) <= 0) return setError("Enter valid total marks.");
    if (!form.duration_minutes || Number(form.duration_minutes) <= 0) return setError("Enter valid duration.");
    if (!form.application_open_date) return setError("Select Apply for Test open date.");
    if (!form.application_close_date) return setError("Select Apply for Test close date.");

    if (form.application_close_date < form.application_open_date) {
      return setError("Apply for Test close date cannot be before the open date.");
    }


    setSaving(true);
    setError("");
    setMessage("");

    try {
      const editing = Boolean(scheduleForm.id);
      const payload = {
        adminId,
        test_code: form.test_code.trim().toUpperCase(),
        test_series_id: Number(form.test_series_id),
        subject_name: form.subject_name.trim(),
        duration_minutes: Number(form.duration_minutes),
        total_marks: Number(form.total_marks),
        portion: form.portion.trim(),
        chapter: form.chapter.trim(),
        application_open_date: form.application_open_date,
        application_close_date: form.application_close_date,
        status: form.status || "Scheduled",
      };

      const response = await api(
        editing
          ? "/test-batch/tests/" + encodeURIComponent(form.id)
          : "/test-batch/tests",
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify(payload),
        }
      );

      await loadTests();
      await loadEligibleTests();
      resetScheduleForm();
      setSection("list");
      setMessage(
        editing
          ? "Test Batch Post Test schedule updated successfully."
          : "Test Batch Post Test scheduled successfully."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function loadEligibleTests() {
    try {
      // Always start from the main Test Batch list. This endpoint is also
      // used by Test List, so every posted Test Batch test remains selectable
      // even if the specialized mark-entry endpoint is temporarily stale.
      const testListData = await api(
        "/test-batch/tests?adminId=" + encodeURIComponent(adminId)
      );

      const allTests = (testListData.tests || []).filter(
        (test) => test.status !== "Cancelled"
      );

      // Enrich the list with registration counts when the mark-entry
      // endpoint is available. The test itself must never disappear just
      // because that enrichment request returns no rows.
      try {
        const markEntryData = await api(
          "/test-batch/mark-entry/tests?adminId=" +
            encodeURIComponent(adminId)
        );

        const markEntryByCode = new Map(
          (markEntryData.tests || []).map((test) => [test.test_code, test])
        );

        setEligibleTests(
          allTests.map((test) => ({
            ...test,
            registered_students:
              markEntryByCode.get(test.test_code)?.registered_students ?? 0,
          }))
        );
      } catch {
        setEligibleTests(allTests);
      }
    } catch (err) {
      setError(err.message);
      setEligibleTests([]);
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
      // Load the registered students directly. This is the source of truth
      // for Test Batch registration and does not depend on attendance.
      const registeredData = await api(
        "/test-batch/tests/" +
          encodeURIComponent(testCode) +
          "/registered-students?adminId=" +
          encodeURIComponent(adminId)
      );

      let loadedStudents = (registeredData.students || []).map(normalizeStudent);
      let loadedTest = registeredData.test || null;

      // Enrich with existing marks/mark-entry metadata when available.
      // A mark-entry error must not hide registered students.
      try {
        const markData = await api(
          "/test-batch/tests/" +
            encodeURIComponent(testCode) +
            "/mark-entry?adminId=" +
            encodeURIComponent(adminId)
        );

        loadedTest = markData.test || loadedTest;
        const existingByRoll = new Map(
          (markData.students || []).map((student) => [
            student.roll_no,
            normalizeStudent(student),
          ])
        );

        loadedStudents = loadedStudents.map((student) => ({
          ...student,
          ...(existingByRoll.get(student.roll_no) || {}),
        }));
      } catch {
        // Keep the registered-student list even if mark-entry metadata
        // is unavailable.
      }

      setMarkTest(loadedTest);
      setStudents(loadedStudents);
      setOriginalStudents(JSON.parse(JSON.stringify(loadedStudents)));
    } catch (err) {
      setMarkTest(null);
      setStudents([]);
      setOriginalStudents([]);
      setError(err.message);
    } finally {
      setLoadingMarks(false);
    }
  }

  async function loadRegisteredStudents(code) {
    if (!code) {
      setRegisteredStudents([]);
      return;
    }

    setLoadingRegisteredStudents(true);
    setError("");
    setMessage("");

    try {
      const data = await api(
        "/test-batch/tests/" +
          encodeURIComponent(code) +
          "/registered-students?adminId=" +
          encodeURIComponent(adminId)
      );

      setRegisteredStudents(data.students || []);
    } catch (err) {
      setRegisteredStudents([]);
      setError(err.message);
    } finally {
      setLoadingRegisteredStudents(false);
    }
  }

  useEffect(() => {
    if (!authorized) return;

    loadTests();
    loadEligibleTests();
    loadTestSeries();
  }, [adminId, authorized, search]);

  useEffect(() => {
    if (section === "mark-entry" && !selectedMarkTest) {
      setMarkTest(null);
      setStudents([]);
      setOriginalStudents([]);
    }
  }, [section, selectedMarkTest]);

  useEffect(() => {
    if (section === "registered-students") {
      loadRegisteredStudents(registeredStudentTest);
    }
    if (section === "post-test" && selectedPostTest) {
      loadPostTest(selectedPostTest);
    }
  }, [section, registeredStudentTest, selectedPostTest]);

  async function loadPostTestTests() {
    try {
      const [completedData, returnedData] = await Promise.all([
        api(
          "/test-batch/tests?adminId=" +
            encodeURIComponent(adminId) +
            "&status=Completed"
        ),
        api(
          "/test-batch/tests?adminId=" +
            encodeURIComponent(adminId) +
            "&status=Returned"
        ),
      ]);

      const combined = [...(completedData.tests || []), ...(returnedData.tests || [])]
        .sort((a, b) => new Date(b.writing_date) - new Date(a.writing_date));

      setPostTestTests(combined);
    } catch (err) {
      setPostTestTests([]);
      setError("Failed to fetch completed/returned Test Batch tests");
    }
  }

  async function loadPostTest(testCode) {
    if (!testCode) {
      setPostTest(null);
      return;
    }

    setLoadingPostTest(true);
    setError("");
    setMessage("");

    try {
      const data = await api(
        "/test-batch/tests/" +
          encodeURIComponent(testCode) +
          "/post-test?adminId=" +
          encodeURIComponent(adminId)
      );

      const test = data.test;
      setPostTest(test);
      setPostTestForm({
        manual_mark_entry_enabled: test.manual_mark_entry_enabled !== false,
        bulk_mark_upload_enabled: test.bulk_mark_upload_enabled === true,
        passing_percentage: Number(test.passing_percentage ?? 40),
        grade_boundaries: {
          A: Number(test.grade_boundaries?.A ?? 90),
          B: Number(test.grade_boundaries?.B ?? 75),
          C: Number(test.grade_boundaries?.C ?? 60),
          D: Number(test.grade_boundaries?.D ?? 40),
        },
        result_publication_mode: test.result_publication_mode || "approval",
        show_detailed_breakdown: test.show_detailed_breakdown === true,
        reevaluation_enabled: test.reevaluation_enabled === true,
        lock_marks_after_final_submission:
          test.lock_marks_after_final_submission !== false,
        post_test_export_enabled: test.post_test_export_enabled !== false,
      });
    } catch (err) {
      setPostTest(null);
      setError(err.message);
    } finally {
      setLoadingPostTest(false);
    }
  }

  function updatePostTest(field, value) {
    setPostTestForm((current) => ({ ...current, [field]: value }));
    setMessage("");
  }

  function updateGrade(grade, value) {
    setPostTestForm((current) => ({
      ...current,
      grade_boundaries: {
        ...current.grade_boundaries,
        [grade]: value,
      },
    }));
    setMessage("");
  }

  async function savePostTest(event) {
    event.preventDefault();
    if (!postTest) return;

    setSaving(true);
    setError("");    setMessage("");

    try {
      const data = await api(
        "/test-batch/tests/" +
          encodeURIComponent(postTest.test_code) +
          "/post-test",
        {
          method: "PUT",
          body: JSON.stringify({
            adminId,
            ...postTestForm,
          }),
        }
      );

      setPostTest(data.test);
      await loadTests();
      await loadEligibleTests();
      await loadPostTestTests();
      setMessage("Test Batch Post Test settings saved successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function publishPostTestResults() {
    if (!postTest || postTest.result_publication_mode !== "approval") return;

    if (!window.confirm("Publish results for " + postTest.test_code + " to Test Batch students?")) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const data = await api(
        "/test-batch/tests/" +
          encodeURIComponent(postTest.test_code) +
          "/post-test/publish",
        {
          method: "POST",
          body: JSON.stringify({ adminId }),
        }
      );
      setPostTest((current) => ({
        ...current,
        ...data.test,
      }));
      await loadTests();
      setMessage("Test Batch results published successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function exportPostTestReport() {
    if (!postTest || !postTest.post_test_export_enabled) return;

    try {
      const data = await api(
        "/test-batch/tests/" +
          encodeURIComponent(postTest.test_code) +
          "/results?adminId=" +
          encodeURIComponent(adminId)
      );

      if (!data.results?.length) {
        window.alert("No marks are available for export.");
        return;
      }

      const rows = data.results.map((row) =>
        "<tr><td>" +
        row.roll_no +
        "</td><td>" +
        row.name +
        "</td><td>" +
        row.subject_name +
        "</td><td>" +
        row.marks_obtained +
        "</td><td>" +
        row.total_marks +
        "</td><td>" +
        (row.percentage ?? "") +
        "</td><td>" +
        (row.result_status ?? "") +
        "</td><td>" +
        (row.comments || "") +
        "</td></tr>"
      ).join("");

      const html =
        "<table border='1'><tr><th>Roll No</th><th>Student</th><th>Subject</th><th>Marks</th><th>Total</th><th>Percentage</th><th>Result</th><th>Remarks</th></tr>" +
        rows +
        "</table>";

      const blob = new Blob([html], { type: "application/vnd.ms-excel" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = postTest.test_code + "_test_batch_final_report.xls";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

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
    openPostTestScheduler(test);
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

  const filteredMarkTests = useMemo(() => {
    if (!markSeriesFilter) return eligibleTests;
    return eligibleTests.filter(
      (test) => String(test.test_series_id) === String(markSeriesFilter)
    );
  }, [eligibleTests, markSeriesFilter]);

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

      {section === "" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <a
          href={"/faculty-dashboard/test-batch/enter-marks?id=" + encodeURIComponent(adminId)}
          onClick={(event) => {
            event.preventDefault();
            window.location.assign(
              "/faculty-dashboard/test-batch/enter-marks?id=" + encodeURIComponent(adminId)
            );
          }}
          className="text-left bg-white shadow-md rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:scale-[1.02] transition block"
        >
          <h3 className="text-lg font-semibold text-blue-700 mb-2">
            Test Batch – Enter Marks
          </h3>
          <p className="text-gray-600">
            Select a posted Test Batch test and enter marks for students who
            registered. Save and finalize marks after the test is conducted.
          </p>
        </a>

        <a
          href={"/faculty-dashboard/test-batch/test-list?id=" + encodeURIComponent(adminId)}
          onClick={(event) => {
            event.preventDefault();
            window.location.assign(
              "/faculty-dashboard/test-batch/test-list?id=" + encodeURIComponent(adminId)
            );
          }}
          className="text-left bg-white shadow-md rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:scale-[1.02] transition block"
        >
          <h3 className="text-lg font-semibold text-blue-700 mb-2">
            Test Batch – Test List
          </h3>
          <p className="text-gray-600">
            View, search, edit and export Test Batch tests.
          </p>
        </a>

        <a
          href={"/faculty-dashboard/test-batch/post-test?id=" + encodeURIComponent(adminId)}
          onClick={(event) => {
            event.preventDefault();
            window.location.assign(
              "/faculty-dashboard/test-batch/post-test?id=" + encodeURIComponent(adminId)
            );
          }}
          className="text-left bg-white shadow-md rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:scale-[1.02] transition block"
        >
          <h3 className="text-lg font-semibold text-blue-700 mb-2">
            Test Batch – Post Test
          </h3>
          <p className="text-gray-600">
            Schedule a Test Batch test with the batch, subject, marks, portion, duration and application dates. Students choose their test date and slot during registration.
          </p>
        </a>

        <a
          href={"/faculty-dashboard/test-batch/registered-students?id=" + encodeURIComponent(adminId)}
          onClick={(event) => {
            event.preventDefault();
            window.location.assign(
              "/faculty-dashboard/test-batch/registered-students?id=" + encodeURIComponent(adminId)
            );
          }}
          className="text-left bg-white shadow-md rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:scale-[1.02] transition block"
        >
          <h3 className="text-lg font-semibold text-blue-700 mb-2">
            Test Batch – Registered Students
          </h3>
          <p className="text-gray-600">
            View students registered for each posted Test Batch test, including
            their selected test date and slot.
          </p>
        </a>
        </div>
      )}

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

      {section === "schedule" && (
        <Card>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h3 className="text-xl font-bold text-blue-800">
                Test Batch – Post Test / Schedule
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Schedule or update a Test Batch test. Students will choose their test date and slot during registration within the configured application window.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (standalone) {
                  router.push(
                    "/faculty-dashboard/test?id=" +
                      encodeURIComponent(adminId)
                  );
                  return;
                }
                setSection("");
                resetScheduleForm();
              }}
              className="px-4 py-2 bg-gray-100 rounded-lg"
            >
              Close            </button>
          </div>

          <form onSubmit={saveScheduledTest} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <label className="text-sm text-gray-600">
                Test Code
                <input
                  value={scheduleForm.test_code}
                  onChange={(e) =>
                    updateSchedule("test_code", e.target.value.toUpperCase())
                  }
                  readOnly={Boolean(scheduleForm.id)}
                  placeholder="Example: IAT001M50"
                  className="block w-full border rounded-lg px-4 py-3 mt-1"
                />
              </label>

              <label className="text-sm text-gray-600">
                Test Batch / Series
                <select
                  value={scheduleForm.test_series_id}
                  onChange={(e) => updateSchedule("test_series_id", e.target.value)}
                  className="block w-full border rounded-lg px-4 py-3 mt-1 bg-white"
                >
                  <option value="">Select Test Batch</option>
                  {testSeries.map((series) => (
                    <option key={series.id} value={series.id}>
                      {series.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Subject
                <input
                  value={scheduleForm.subject_name}
                  onChange={(e) => updateSchedule("subject_name", e.target.value)}
                  placeholder="Enter subject"
                  className="block w-full border rounded-lg px-4 py-3 mt-1"
                />
              </label>

              <label className="text-sm text-gray-600">
                Total Marks
                <input
                  type="number"
                  min="1"
                  value={scheduleForm.total_marks}
                  onChange={(e) => updateSchedule("total_marks", e.target.value)}
                  className="block w-full border rounded-lg px-4 py-3 mt-1"
                />
              </label>

              <label className="text-sm text-gray-600">
                Duration (minutes)
                <input
                  type="number"
                  min="1"
                  value={scheduleForm.duration_minutes}
                  onChange={(e) => updateSchedule("duration_minutes", e.target.value)}
                  className="block w-full border rounded-lg px-4 py-3 mt-1"
                />
              </label>

              <label className="text-sm text-gray-600">
                Status
                <select
                  value={scheduleForm.status}
                  onChange={(e) => updateSchedule("status", e.target.value)}
                  className="block w-full border rounded-lg px-4 py-3 mt-1 bg-white"
                >
                  <option value="Draft">Draft</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Active">Active</option>
                  <option value="Completed">Completed</option>
                  <option value="Returned">Returned</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Apply for Test – Open Date
                <input
                  type="date"
                  value={scheduleForm.application_open_date}
                  onChange={(e) => updateSchedule("application_open_date", e.target.value)}
                  className="block w-full border rounded-lg px-4 py-3 mt-1"
                />
              </label>

              <label className="text-sm text-gray-600">
                Apply for Test – Close Date
                <input
                  type="date"
                  value={scheduleForm.application_close_date}
                  onChange={(e) => updateSchedule("application_close_date", e.target.value)}
                  className="block w-full border rounded-lg px-4 py-3 mt-1"
                />
              </label>

              <label className="text-sm text-gray-600 md:col-span-2">
                Portion
                <textarea
                  value={scheduleForm.portion}
                  onChange={(e) => updateSchedule("portion", e.target.value)}
                  rows={3}
                  placeholder="Enter test portion"
                  className="block w-full border rounded-lg px-4 py-3 mt-1"
                />
              </label>

              <label className="text-sm text-gray-600 md:col-span-2">
                Chapter
                <input
                  value={scheduleForm.chapter}
                  onChange={(e) => updateSchedule("chapter", e.target.value)}
                  placeholder="Enter chapter"
                  className="block w-full border rounded-lg px-4 py-3 mt-1"
                />
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-700 text-white px-6 py-3 rounded-lg disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : scheduleForm.id
                  ? "Update Test"
                  : "Post Test"}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetScheduleForm();
                  setSection("");
                }}
                disabled={saving}
                className="px-6 py-3 bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </form>
        </Card>
      )}

      {section === "mark-entry" && (
        <Card>
          <div className="flex flex-wrap items-start gap-4 justify-between mb-5">
            <div>
              <h3 className="text-xl font-bold text-blue-800">
                Test Batch – Enter Marks
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Select a Test Batch test and click Load Students to view the
                students who registered for that test.
              </p>
            </div>
            <button
              onClick={() => {
                if (standalone) {
                  router.push(
                    "/faculty-dashboard/test?id=" +
                      encodeURIComponent(adminId)
                  );
                  return;
                }

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

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="text-sm text-gray-600">
                Test Series
                <select
                  className="block w-full border rounded-lg px-4 py-3 mt-1 bg-white"
                  value={markSeriesFilter}
                  onChange={async (event) => {
                    const seriesId = event.target.value;
                    setMarkSeriesFilter(seriesId);
                    setSelectedMarkTest("");
                    setMarkTest(null);
                    setStudents([]);
                    setOriginalStudents([]);
                    setError("");
                    setMessage("");

                    if (!seriesId) return;

                    const matchingTests = eligibleTests.filter(
                      (test) => String(test.test_series_id) === String(seriesId)
                    );

                    if (matchingTests.length === 1) {
                      const testCode = matchingTests[0].test_code;
                      setSelectedMarkTest(testCode);
                      await loadMarkEntry(testCode);
                      return;
                    }

                    try {
                      setLoadingMarks(true);
                      const data = await api(
                        "/test-batch/mark-entry/series/" +
                          encodeURIComponent(seriesId) +
                          "?adminId=" +
                          encodeURIComponent(adminId)
                      );
                      setStudents(
                        (data.students || []).map((student) => ({
                          ...student,
                          marks_obtained: "",
                          remarks: "",
                        }))
                      );
                      setOriginalStudents([]);
                      setMessage(
                        matchingTests.length
                          ? "Students loaded for the selected Test Series. Select a Test Code to enter marks for a specific test."
                          : "No posted tests found for the selected Test Series."
                      );
                    } catch (err) {
                      setError(err.message);
                    } finally {
                      setLoadingMarks(false);
                    }
                  }}
                >
                  <option value="">All Test Series</option>
                  {testSeries.map((series) => (
                    <option key={series.id} value={series.id}>
                      {series.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="lg:col-span-2">
              <label className="text-sm text-gray-600">
                Test Code
                <select
                  className="block w-full border rounded-lg px-4 py-3 mt-1 bg-white"
                  value={selectedMarkTest}
                  onChange={(event) => {
                    setSelectedMarkTest(event.target.value);
                    setMarkTest(null);
                    setStudents([]);
                    setOriginalStudents([]);
                    setError("");
                  }}
                >
                  <option value="">
                    {filteredMarkTests.length ? "Select Test Code" : "No tests found"}
                  </option>
                  {filteredMarkTests.map((test) => (
                    <option key={test.test_code} value={test.test_code}>
                      {test.test_code} — {test.subject_name} — {test.status}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => loadMarkEntry(selectedMarkTest)}
                disabled={!selectedMarkTest || loadingMarks}
                className="w-full bg-blue-600 text-white px-5 py-3 rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
              >
                {loadingMarks ? "Loading..." : "Load Students"}
              </button>
            </div>
          </div>

          {!selectedMarkTest && !markSeriesFilter ? (
            <div className="border border-dashed rounded-lg p-8 text-center text-gray-500">
              Select a Test Series or Test Code to load students.
            </div>
          ) : loadingMarks ? (
            <p className="text-gray-500">Loading students...</p>
          ) : !markTest && markSeriesFilter ? (
            students.length === 0 ? (
              <div className="border border-dashed rounded-lg p-8 text-center text-gray-500">
                No registered students found for the selected Test Series.
              </div>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-blue-700 text-white">
                    <tr>
                      <th className="text-left px-4 py-3">Student Name</th>
                      <th className="text-left px-4 py-3">Class</th>
                      <th className="text-left px-4 py-3">Roll No</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student.roll_no} className="border-t">
                        <td className="px-4 py-3">{student.name}</td>
                        <td className="px-4 py-3">{student.class}</td>
                        <td className="px-4 py-3">{student.roll_no}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
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
                  <div className="text-xs text-gray-500">Registered Students</div>
                  <div className="font-semibold">
                    {students.length}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Max Marks</div>
                  <div className="font-semibold">{markTest.total_marks}</div>
                </div>
              </div>

              {markTest.manual_mark_entry_enabled === false ? (
                <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-5 text-yellow-800">
                  Manual mark entry is disabled for this test in Post Test
                  settings. Use the configured bulk CSV / Excel workflow.
                </div>
              ) : students.length === 0 ? (
                <div className="border border-dashed rounded-lg p-8 text-center text-gray-500">
                  No Test Batch students are registered for this test yet.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full min-w-[950px]">
                      <thead className="bg-blue-700 text-white">
                        <tr>
                          <th className="p-3 text-left">Student Name</th>
                          <th className="p-3 text-left">Class</th>
                          <th className="p-3 text-left">Roll No</th>
                          <th className="p-3 text-left">Marks Obtained</th>
                          <th className="p-3 text-left">Max Marks</th>
                          <th className="p-3 text-left">Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((student, index) => {
                          const locked =
                            markTest.marks_entry_status === "Finalized" &&
                            markTest.lock_marks_after_final_submission !== false;

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
                              <td className="p-3">
                                {student.class || "-"}
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
            {standalone && (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/faculty-dashboard/test?id=" +
                      encodeURIComponent(adminId)
                  )
                }
                className="px-4 py-2 bg-gray-100 rounded-lg"
              >
                Close
              </button>
            )}
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
                          onClick={() => openPostTestScheduler(test)}
                          className="bg-yellow-500 text-white px-3 py-1 rounded"
                        >
                          Edit Schedule
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

      {section === "registered-students" && (
        <Card>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h3 className="text-xl font-bold text-blue-800">
                Test Batch – Registered Students
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Select a posted Test Batch test to view only the students who
                registered for that test and the date and slot they selected.
              </p>
            </div>
            <button
              onClick={() => {
                if (standalone) {
                  router.push(
                    "/faculty-dashboard/test?id=" +
                      encodeURIComponent(adminId)
                  );
                  return;
                }
                setSection("");
                setRegisteredStudentTest("");
                setRegisteredStudents([]);
              }}
              className="px-4 py-2 bg-gray-100 rounded-lg"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="lg:col-span-2">
              <label className="text-sm text-gray-600">
                Select Test
                <select
                  className="block w-full border rounded-lg px-4 py-3 mt-1 bg-white"
                  value={registeredStudentTest}
                  onChange={(event) =>
                    setRegisteredStudentTest(event.target.value)
                  }
                >
                  <option value="">Select Test</option>
                  {tests
                    .filter((test) => test.status !== "Cancelled")
                    .map((test) => (
                      <option key={test.test_code} value={test.test_code}>
                        {test.test_code} — {test.test_series_name} —{" "}
                        {test.subject_name} — {test.status}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <div className="bg-gray-50 border rounded-lg px-4 py-3">
              <div className="text-xs text-gray-500">Registered Students</div>
              <div className="font-semibold text-blue-800 mt-1">
                {registeredStudents.length}
              </div>
            </div>
          </div>

          {!registeredStudentTest ? (
            <div className="border border-dashed rounded-lg p-8 text-center text-gray-500">
              Select a Test Batch test to view its registered students.
            </div>
          ) : loadingRegisteredStudents ? (
            <p className="text-gray-500">Loading registered students...</p>
          ) : registeredStudents.length === 0 ? (
            <div className="border border-dashed rounded-lg p-8 text-center text-gray-500">
              No students have registered for this test yet.
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full min-w-[1000px]">
                <thead className="bg-blue-700 text-white">
                  <tr>
                    <th className="p-3 text-left">Student Name</th>
                    <th className="p-3 text-left">Class</th>
                    <th className="p-3 text-left">Roll No</th>
                    <th className="p-3 text-left">Test Date</th>
                    <th className="p-3 text-left">Test Slot</th>
                    <th className="p-3 text-left">Registration Status</th>
                  </tr>
                </thead>
                <tbody>
                  {registeredStudents.map((student, index) => (
                    <tr
                      key={student.roll_no}
                      className={
                        index % 2 === 0 ? "bg-gray-50 border-b" : "border-b"
                      }
                    >
                      <td className="p-3 font-medium">{student.name}</td>
                      <td className="p-3">{student.class || "-"}</td>
                      <td className="p-3 font-semibold text-blue-700">
                        {student.roll_no}
                      </td>
                      <td className="p-3">
                        {formatDate(student.registered_writing_date)}
                      </td>
                      <td className="p-3">
                        {student.registered_slot_start || "-"} –{" "}
                        {student.registered_slot_end || "-"}
                      </td>
                      <td className="p-3">{student.registration_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

    </div>
  );
}