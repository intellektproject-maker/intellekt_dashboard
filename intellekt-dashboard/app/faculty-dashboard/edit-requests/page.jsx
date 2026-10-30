"use client";

import { useCallback, useEffect, useState } from "react";
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
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function dateLabel(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString("en-IN");
}

function scopeLabel(request) {
  return request._source === "test_batch" || request.record_scope === "test_batch" || request.record_type === "test_batch" ? "Test Batch" : "Regular Student";
}

function scheduleValueLabel(request) {
  try {
    const value = JSON.parse(request.original_value || "{}");
    return [
      "Subject: " + (value.subject_name || "-"),
      "Max marks: " + (value.total_marks ?? "-"),
      "Duration: " + (value.duration_minutes ? value.duration_minutes + " min" : "-"),
      "Apply open: " + dateLabel(value.application_open_date),
      "Apply close: " + dateLabel(value.application_close_date),
      "Writing close: " + dateLabel(value.writing_close_date),
      "Status: " + (value.status || "-"),
    ].join(" · ");
  } catch {
    return "Current test schedule";
  }
}

function currentValueLabel(request) {
  if (request.record_type === "schedule") return scheduleValueLabel(request);
  if (request.record_type === "marks" && request.roll_no === "*") {
    try {
      const rows = JSON.parse(request.original_value || "[]");
      if (Array.isArray(rows)) {
        return rows.map((row) =>
          String(row.roll_no || "-") + ": " + String(row.marks_obtained ?? "-") +
          (row.total_marks != null ? " / " + String(row.total_marks) : "")
        ).join("; ");
      }
    } catch {
      return "Multiple student marks";
    }
    return "Multiple student marks";
  }
  return request.original_value ?? "-";
}

function recordLabel(request) {
  if (request.record_type === "schedule") return "Test Schedule · " + (request.test_code || "-");
  return request.record_type === "attendance"
    ? "Attendance · " + dateLabel(request.attendance_date)
    : "Marks · " + (request.test_code || "-") +
      (request.subject_name ? " · " + request.subject_name : "") +
      (request.roll_no === "*" && request.attendance_date ? " · Writing date " + dateLabel(request.attendance_date) : "");
}

export default function EditRequestsPage() {
  const params = useSearchParams();
  const facultyId = String(params.get("id") || "").trim().toUpperCase();
  const isAdmin = ADMIN_IDS.includes(facultyId);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (isAdmin) {
        const [regular, testBatch] = await Promise.all([
          api("/record-edit-requests?adminId=" + encodeURIComponent(facultyId)),
          api("/test-batch/record-edit-requests?adminId=" + encodeURIComponent(facultyId)),
        ]);
        setRequests([
          ...(Array.isArray(regular) ? regular.map((r) => ({ ...r, _source: "regular" })) : []),
          ...(Array.isArray(testBatch) ? testBatch.map((r) => ({ ...r, _source: "test_batch" })) : []),
        ].sort((a, b) => {
          const pendingOrder = (a.status === "Pending" ? 0 : 1) - (b.status === "Pending" ? 0 : 1);
          return pendingOrder || new Date(b.created_at || 0) - new Date(a.created_at || 0);
        }));
      } else {
        if (!/^IG\d{3,}$/.test(facultyId)) throw new Error("A valid faculty account is required.");
        const [regular, testBatch] = await Promise.all([
          api("/record-edit-requests/approved?facultyId=" + encodeURIComponent(facultyId)),
          api("/test-batch/record-edit-requests/approved?facultyId=" + encodeURIComponent(facultyId)),
        ]);
        setRequests([
          ...(Array.isArray(regular) ? regular.map((r) => ({ ...r, _source: "regular" })) : []),
          ...(Array.isArray(testBatch) ? testBatch.map((r) => ({ ...r, _source: "test_batch" })) : []),
        ].sort((a, b) => new Date(b.reviewed_at || 0) - new Date(a.reviewed_at || 0)));
      }
    } catch (e) {
      setError(e.message || "Could not load edit requests.");
    } finally {
      setLoading(false);
    }
  }, [facultyId, isAdmin]);

  useEffect(() => { load(); }, [load]);

  async function review(request, decision) {
    const label = decision === "approve" ? "approve" : "reject";
    if (!window.confirm("Are you sure you want to " + label + " this edit request?")) return;
    const key = request._source + "-" + request.id;
    setBusyId(key);
    setError("");
    try {
      const path = request._source === "test_batch"
        ? "/test-batch/record-edit-requests/" + request.id + "/review"
        : "/record-edit-requests/" + request.id + "/review";
      await api(path, {
        method: "PUT",
        body: JSON.stringify({ adminId: facultyId, decision }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId("");
    }
  }

  async function apply(request) {
    const key = request._source + "-" + request.id;
    setBusyId(key);
    setError("");
    try {
      const path = request._source === "test_batch"
        ? "/test-batch/record-edit-requests/" + request.id + "/apply"
        : "/record-edit-requests/" + request.id + "/apply";
      await api(path, {
        method: "POST",
        body: JSON.stringify({ facultyId, newValue: request.requested_value }),
      });
      window.alert("Approved edit applied successfully.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId("");
    }
  }

  if (!isAdmin && !/^IG\d{3,}$/.test(facultyId)) {
    return <div className="rounded-xl border border-red-200 bg-white p-6 text-red-700">Unauthorized. Please sign in with a valid faculty account.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-blue-800">Edit Approval Requests</h1>
          <p className="mt-1 text-sm text-gray-600">
            {isAdmin
              ? "Review faculty requests before any existing marks or attendance can be changed."
              : "Only approved requests can be applied. Pending or rejected requests do not permit edits."}
          </p>
        </div>
        <button onClick={load} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">Refresh</button>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {loading ? <p className="py-6 text-gray-500">Loading edit requests...</p> : requests.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-500">
          {isAdmin ? "No edit requests found." : "You have no approved edit requests to apply."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[1050px] border-collapse">
            <thead>
              <tr className="bg-blue-700 text-left text-white">
                <th className="p-3">Faculty</th>
                <th className="p-3">Student</th>
                <th className="p-3">Module</th>
                <th className="p-3">Record</th>
                <th className="p-3">Current</th>
                <th className="p-3">Requested</th>
                <th className="p-3">Requested At</th>
                <th className="p-3">Status</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const key = request._source + "-" + request.id;
                return (
                  <tr key={key} className="border-b last:border-b-0">
                    <td className="p-3">
                      <div className="font-semibold">{request.requested_by_name || request.requested_by || "-"}</div>
                      <div className="text-xs text-gray-500">{request.requested_by || "-"}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold">{request.record_type === "schedule" ? "Test schedule" : request.student_name || "-"}</div>
                      <div className="text-xs text-gray-500">{request.record_type === "schedule" ? request.test_code : request.roll_no === "*" ? (request.attendance_date ? "All students on selected writing date" : "All students in test code") : request.roll_no}</div>
                    </td>
                    <td className="p-3">{scopeLabel(request)}</td>
                    <td className="p-3">{recordLabel(request)}</td>
                    <td className="p-3">{currentValueLabel(request)}</td>
                    <td className="p-3 font-semibold">{request.record_type === "schedule" ? "Edit schedule permission" : request.roll_no === "*" && request.requested_value === "BULK_EDIT" ? "Overall edit permission" : request.record_type === "marks" && String(request.original_value ?? "").trim() === String(request.requested_value ?? "").trim() ? "Edit permission" : request.requested_value ?? "-"}</td>
                    <td className="p-3">{dateLabel(request.created_at)}</td>
                    <td className="p-3">
                      <span className={
                        "rounded-full px-2 py-1 text-xs font-semibold " +
                        (request.status === "Approved" ? "bg-green-100 text-green-800" :
                          request.status === "Declined" ? "bg-red-100 text-red-800" :
                          request.status === "Applied" ? "bg-blue-100 text-blue-800" :
                          "bg-amber-100 text-amber-800")
                      }>{request.status}</span>
                    </td>
                    <td className="p-3">
                      {isAdmin && request.status === "Pending" ? (
                        <div className="flex gap-2">
                          <button disabled={busyId === key} onClick={() => review(request, "approve")} className="rounded bg-green-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">Approve</button>
                          <button disabled={busyId === key} onClick={() => review(request, "decline")} className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">Reject</button>
                        </div>
                      ) : !isAdmin && request.status === "Approved" && request.record_type !== "schedule" ? (
                        <button disabled={busyId === key} onClick={() => apply(request)} className="rounded bg-blue-700 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">
                          {busyId === key ? "Applying..." : "Apply Approved Edit"}
                        </button>
                      ) : !isAdmin && request.status === "Approved" && request.record_type === "schedule" ? (
                        <span className="text-sm font-medium text-green-700">Approved — edit from Test List</span>
                      ) : <span className="text-sm text-gray-400">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
