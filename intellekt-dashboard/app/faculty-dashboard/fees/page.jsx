"use client";

import { useEffect, useState } from "react";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://responsible-wonder-production.up.railway.app";

const EMPTY_FORM = {
  total_fee: "",
  paid_amount: "",
  pending_amount: "",
  due_date: "",
  status: "Pending",
};

export default function FeesPage() {
  // =========================================================
  // STATE
  // =========================================================

  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingStudent, setEditingStudent] = useState(null);
  const [saving, setSaving] = useState(false);

  const [feeForm, setFeeForm] = useState(EMPTY_FORM);

  // =========================================================
  // GET FACULTY ID FROM URL
  // =========================================================

  const getFacultyId = () => {
    if (typeof window === "undefined") {
      return "";
    }

    const params = new URLSearchParams(window.location.search);

    return params.get("id") || "";
  };

  // =========================================================
  // FETCH FEE DETAILS
  // =========================================================

  const fetchFeeDetails = async () => {
    try {
      setLoading(true);
      setError("");

      const url = `${BACKEND_URL}/faculty/fees`;

      console.log("Fetching fee details from:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

      const responseText = await response.text();

      let data;

      try {
        data = JSON.parse(responseText);
      } catch {
        data = responseText;
      }

      console.log("GET /faculty/fees status:", response.status);
      console.log("GET /faculty/fees response:", data);

      if (!response.ok) {
        const message =
          typeof data === "object" && data?.error
            ? data.error
            : `Failed to fetch fee details (${response.status})`;

        throw new Error(message);
      }

      if (!Array.isArray(data)) {
        throw new Error(
          "The server returned an invalid fee records response."
        );
      }

      setStudents(data);
    } catch (err) {
      console.error("Error fetching fee details:", err);

      setStudents([]);

      setError(
        err?.message ||
          "Unable to load student fee details."
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // INITIAL LOAD
  // =========================================================

  useEffect(() => {
    fetchFeeDetails();
  }, []);

  // =========================================================
  // SEARCH
  // =========================================================

  const search = searchTerm.trim().toLowerCase();

  const filteredStudents = students.filter((student) => {
    if (!search) {
      return true;
    }

    const name = String(student?.name || "").toLowerCase();
    const rollNo = String(student?.roll_no || "").toLowerCase();
    const registerNo = String(
      student?.register_no || ""
    ).toLowerCase();

    return (
      name.includes(search) ||
      rollNo.includes(search) ||
      registerNo.includes(search)
    );
  });

  // =========================================================
  // OPEN EDIT MODAL
  // =========================================================

  const openEditModal = (student) => {
    const totalFee = Number(student?.total_fee || 0);
    const paidAmount = Number(student?.paid_amount || 0);

    const pendingAmount = Math.max(
      totalFee - paidAmount,
      0
    );

    const status =
      totalFee > 0 && paidAmount >= totalFee
        ? "Paid"
        : "Pending";

    setEditingStudent(student);

    setFeeForm({
      total_fee:
        student?.total_fee ?? "",

      paid_amount:
        student?.paid_amount ?? "",

      pending_amount:
        student?.pending_amount ?? pendingAmount,

      due_date: student?.due_date
        ? String(student.due_date).substring(0, 10)
        : "",

      status:
        student?.status || status,
    });
  };

  // =========================================================
  // CLOSE EDIT MODAL
  // =========================================================

  const closeEditModal = () => {
    setEditingStudent(null);
    setFeeForm(EMPTY_FORM);
    setSaving(false);
  };

  // =========================================================
  // FORM CHANGE
  // =========================================================

  const handleFeeChange = (event) => {
    const { name, value } = event.target;

    setFeeForm((previous) => {
      const updated = {
        ...previous,
        [name]: value,
      };

      if (
        name === "total_fee" ||
        name === "paid_amount"
      ) {
        const total =
          name === "total_fee"
            ? Number(value || 0)
            : Number(previous.total_fee || 0);

        const paid =
          name === "paid_amount"
            ? Number(value || 0)
            : Number(previous.paid_amount || 0);

        updated.pending_amount = Math.max(
          total - paid,
          0
        );

        updated.status =
          total > 0 && paid >= total
            ? "Paid"
            : "Pending";
      }

      return updated;
    });
  };

  // =========================================================
  // UPDATE FEE
  // =========================================================

  const handleUpdateFee = async (event) => {
    event.preventDefault();

    if (!editingStudent) {
      return;
    }

    const rollNo = String(
      editingStudent.roll_no || ""
    ).trim();

    if (!rollNo) {
      alert("Student roll number is missing.");
      return;
    }

    const totalFee = Number(
      feeForm.total_fee || 0
    );

    const paidAmount = Number(
      feeForm.paid_amount || 0
    );

    if (
      !Number.isFinite(totalFee) ||
      !Number.isFinite(paidAmount)
    ) {
      alert("Please enter valid fee amounts.");
      return;
    }

    if (totalFee < 0 || paidAmount < 0) {
      alert("Fee amounts cannot be negative.");
      return;
    }

    if (paidAmount > totalFee) {
      alert(
        "Paid amount cannot be greater than total fee."
      );
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        `${BACKEND_URL}/faculty/fees/${encodeURIComponent(
          rollNo
        )}`,
        {
          method: "PUT",

          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },

          body: JSON.stringify({
            total_fee: totalFee,
            paid_amount: paidAmount,
            due_date:
              feeForm.due_date || null,
          }),
        }
      );

      const responseText = await response.text();

      let data;

      try {
        data = JSON.parse(responseText);
      } catch {
        data = responseText;
      }

      console.log(
        "PUT /faculty/fees status:",
        response.status
      );

      console.log(
        "PUT /faculty/fees response:",
        data
      );

      if (!response.ok) {
        const message =
          typeof data === "object" && data?.error
            ? data.error
            : `Failed to update fee (${response.status})`;

        throw new Error(message);
      }

      await fetchFeeDetails();

      closeEditModal();

      alert("Fee updated successfully.");
    } catch (err) {
      console.error("Error updating fee:", err);

      alert(
        err?.message ||
          "Failed to update fee."
      );
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // TOGGLE REMINDER
  // =========================================================

  const toggleReminder = async (student) => {
    const rollNo = String(
      student?.roll_no || ""
    ).trim();

    if (!rollNo) {
      alert("Student roll number is missing.");
      return;
    }

    const totalFee = Number(
      student?.total_fee || 0
    );

    const paidAmount = Number(
      student?.paid_amount || 0
    );

    const pendingAmount = Math.max(
      totalFee - paidAmount,
      0
    );

    const isPaid =
      student?.status === "Paid" ||
      (totalFee > 0 && pendingAmount === 0);

    if (isPaid) {
      return;
    }

    const newState =
      !Boolean(student?.reminder_enabled);

    try {
      const response = await fetch(
        `${BACKEND_URL}/faculty/fees/${encodeURIComponent(
          rollNo
        )}/reminder`,
        {
          method: "PATCH",

          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },

          body: JSON.stringify({
            enabled: newState,
          }),
        }
      );

      const responseText = await response.text();

      let data;

      try {
        data = JSON.parse(responseText);
      } catch {
        data = responseText;
      }

      console.log(
        "PATCH reminder status:",
        response.status
      );

      console.log(
        "PATCH reminder response:",
        data
      );

      if (!response.ok) {
        const message =
          typeof data === "object" && data?.error
            ? data.error
            : "Failed to update reminder.";

        throw new Error(message);
      }

      // Update UI immediately.
      setStudents((previous) =>
        previous.map((item) => {
          if (
            String(item?.roll_no || "")
              .trim()
              .toUpperCase() !==
            rollNo.toUpperCase()
          ) {
            return item;
          }

          return {
            ...item,
            reminder_enabled: newState,
          };
        })
      );
    } catch (err) {
      console.error(
        "Error updating reminder:",
        err
      );

      alert(
        err?.message ||
          "Failed to update reminder."
      );
    }
  };

  // =========================================================
  // BELL ICON
  // =========================================================

  const BellIcon = ({ active }) => {
    if (active) {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-6 h-6"
          aria-hidden="true"
        >
          <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm8-5v-1l-1.5-1.5V10a6.5 6.5 0 0 0-5.5-6.42V3a1 1 0 1 0-2 0v.58A6.5 6.5 0 0 0 5.5 10v4.5L4 16v1h16Z" />
        </svg>
      );
    }

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.8}
        stroke="currentColor"
        className="w-6 h-6"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"
        />
      </svg>
    );
  };

  // =========================================================
  // SEARCH ICON
  // =========================================================

  const SearchIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className="w-5 h-5 text-gray-400"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 21-4.35-4.35m0 0A7.5 7.5 0 1 0 6.04 6.04a7.5 7.5 0 0 0 10.61 10.61Z"
      />
    </svg>
  );

  // =========================================================
  // PAGE
  // =========================================================

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">

      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}

      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-blue-800">
          Manage Fees
        </h1>

        <p className="text-gray-500 mt-1">
          Update student fee details and manage reminders.
        </p>
      </div>

      {/* ================================================= */}
      {/* SEARCH */}
      {/* ================================================= */}

      <div className="mb-6">
        <div className="relative max-w-xl">

          <div className="absolute left-4 top-1/2 -translate-y-1/2">
            <SearchIcon />
          </div>

          <input
            type="text"
            placeholder="Search student..."
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(event.target.value)
            }
            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400"
          />

        </div>
      </div>

      {/* ================================================= */}
      {/* ERROR */}
      {/* ================================================= */}

      {!loading && error && (
        <div className="bg-white rounded-2xl border border-red-200 p-8 mb-6">

          <p className="text-red-600 font-semibold text-center">
            Failed to load fee details
          </p>

          <p className="text-red-500 text-sm text-center mt-2 break-words">
            {error}
          </p>

          <div className="flex justify-center mt-5">
            <button
              type="button"
              onClick={fetchFeeDetails}
              className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700"
            >
              Retry
            </button>
          </div>

        </div>
      )}

      {/* ================================================= */}
      {/* LOADING */}
      {/* ================================================= */}

      {loading && (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <p className="text-gray-500">
            Loading fee details...
          </p>
        </div>
      )}

      {/* ================================================= */}
      {/* EMPTY */}
      {/* ================================================= */}

      {!loading &&
        !error &&
        filteredStudents.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">

            <p className="text-gray-500">
              No student fee records found.
            </p>

          </div>
        )}

      {/* ================================================= */}
      {/* STUDENT LIST */}
      {/* ================================================= */}

      {!loading &&
        !error &&
        filteredStudents.length > 0 && (
          <div className="space-y-4">

            {filteredStudents.map((student) => {

              const totalFee = Number(
                student?.total_fee || 0
              );

              const paidAmount = Number(
                student?.paid_amount || 0
              );

              const pendingAmount = Math.max(
                totalFee - paidAmount,
                0
              );

              const isPaid =
                student?.status === "Paid" ||
                (totalFee > 0 &&
                  paidAmount >= totalFee);

              const reminderOn =
                Boolean(
                  student?.reminder_enabled
                ) && !isPaid;

              return (
                <div
                  key={
                    student?.roll_no ||
                    student?.id ||
                    Math.random()
                  }
                  className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5"
                >

                  {/* ===================================== */}
                  {/* TOP ROW */}
                  {/* ===================================== */}

                  <div className="flex items-center justify-between gap-4">

                    <div className="flex items-center gap-3 min-w-0">

                      {/* REMINDER BUTTON */}

                      <button
                        type="button"
                        onClick={() =>
                          !isPaid &&
                          toggleReminder(student)
                        }
                        disabled={isPaid}
                        title={
                          isPaid
                            ? "Fee is paid"
                            : reminderOn
                            ? "Reminder ON"
                            : "Reminder OFF"
                        }
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition flex-shrink-0 ${
                          isPaid
                            ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                            : reminderOn
                            ? "bg-yellow-100 text-yellow-500 hover:bg-yellow-200"
                            : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                        }`}
                      >
                        <BellIcon
                          active={reminderOn}
                        />
                      </button>

                      {/* STUDENT */}

                      <div className="min-w-0">

                        <h2 className="text-lg font-semibold text-gray-800 truncate">
                          {student?.name ||
                            "Student"}
                        </h2>

                        <p className="text-sm text-gray-500">
                          {student?.roll_no ||
                            student?.register_no ||
                            "Student"}
                        </p>

                      </div>

                    </div>

                    {/* EDIT */}

                    <button
                      type="button"
                      onClick={() =>
                        openEditModal(student)
                      }
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition flex-shrink-0"
                    >
                      Edit
                    </button>

                  </div>

                  {/* ===================================== */}
                  {/* FEE INFORMATION */}
                  {/* ===================================== */}

                  <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">

                    {/* TOTAL */}

                    <div>
                      <p className="text-xs text-gray-500">
                        Total Fee
                      </p>

                      <p className="text-base font-semibold text-gray-800 mt-1">
                        ₹
                        {totalFee.toLocaleString(
                          "en-IN"
                        )}
                      </p>
                    </div>

                    {/* PAID */}

                    <div>
                      <p className="text-xs text-gray-500">
                        Paid
                      </p>

                      <p className="text-base font-semibold text-green-600 mt-1">
                        ₹
                        {paidAmount.toLocaleString(
                          "en-IN"
                        )}
                      </p>
                    </div>

                    {/* PENDING */}

                    <div>
                      <p className="text-xs text-gray-500">
                        Pending
                      </p>

                      <p className="text-base font-semibold text-red-600 mt-1">
                        ₹
                        {pendingAmount.toLocaleString(
                          "en-IN"
                        )}
                      </p>
                    </div>

                    {/* STATUS */}

                    <div>
                      <p className="text-xs text-gray-500">
                        Status
                      </p>

                      <span
                        className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-semibold ${
                          isPaid
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {isPaid
                          ? "Paid"
                          : "Pending"}
                      </span>
                    </div>

                  </div>

                  {/* ===================================== */}
                  {/* DUE DATE */}
                  {/* ===================================== */}

                  <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap justify-between gap-2">

                    <p className="text-sm text-gray-500">
                      Due Date:{" "}
                      <span className="font-medium text-gray-700">
                        {student?.due_date
                          ? new Date(
                              student.due_date
                            ).toLocaleDateString(
                              "en-IN"
                            )
                          : "Not set"}
                      </span>
                    </p>

                    <p className="text-sm text-gray-500">
                      Reminder:{" "}
                      <span
                        className={`font-medium ${
                          reminderOn
                            ? "text-yellow-600"
                            : "text-gray-500"
                        }`}
                      >
                        {isPaid
                          ? "Disabled (Paid)"
                          : reminderOn
                          ? "ON"
                          : "OFF"}
                      </span>
                    </p>

                  </div>

                </div>
              );
            })}

          </div>
        )}

      {/* ================================================= */}
      {/* EDIT MODAL */}
      {/* ================================================= */}

      {editingStudent && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">

          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">

            {/* MODAL HEADER */}

            <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">

              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  Update Fee
                </h2>

                <p className="text-sm text-gray-500 mt-1">
                  {editingStudent.name}
                  {" • "}
                  {editingStudent.roll_no}
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditModal}
                className="text-gray-400 hover:text-gray-700 text-2xl"
                aria-label="Close"
              >
                ×
              </button>

            </div>

            {/* FORM */}

            <form
              onSubmit={handleUpdateFee}
              className="p-6 space-y-5"
            >

              {/* TOTAL FEE */}

              <div>

                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Total Fee
                </label>

                <input
                  type="number"
                  min="0"
                  name="total_fee"
                  value={feeForm.total_fee}
                  onChange={handleFeeChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-400"
                />

              </div>

              {/* PAID */}

              <div>

                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paid Amount
                </label>

                <input
                  type="number"
                  min="0"
                  name="paid_amount"
                  value={feeForm.paid_amount}
                  onChange={handleFeeChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-400"
                />

              </div>

              {/* PENDING */}

              <div>

                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pending Amount
                </label>

                <input
                  type="number"
                  name="pending_amount"
                  value={feeForm.pending_amount}
                  readOnly
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-100 text-gray-600"
                />

              </div>

              {/* DUE DATE */}

              <div>

                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Due Date
                </label>

                <input
                  type="date"
                  name="due_date"
                  value={feeForm.due_date}
                  onChange={handleFeeChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-400"
                />

              </div>

              {/* STATUS */}

              <div>

                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Status
                </label>

                <select
                  name="status"
                  value={feeForm.status}
                  onChange={handleFeeChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="Pending">
                    Pending
                  </option>

                  <option value="Paid">
                    Paid
                  </option>
                </select>

              </div>

              {/* REMINDER INFO */}

              <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-4">

                <p className="text-sm text-yellow-800">

                  <strong>
                    Fee Reminder:
                  </strong>{" "}

                  {editingStudent.reminder_enabled &&
                  feeForm.status !== "Paid"
                    ? "Daily reminders are currently ON."
                    : "Daily reminders are currently OFF."}

                </p>

                {feeForm.status === "Paid" && (
                  <p className="text-sm text-green-700 mt-2 font-medium">
                    Marking this fee as paid will stop
                    future reminders.
                  </p>
                )}

              </div>

              {/* BUTTONS */}

              <div className="flex justify-end gap-3 pt-2">

                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving
                    ? "Updating..."
                    : "Update Fee"}
                </button>

              </div>

            </form>

          </div>

        </div>
      )}

    </div>
  );
}