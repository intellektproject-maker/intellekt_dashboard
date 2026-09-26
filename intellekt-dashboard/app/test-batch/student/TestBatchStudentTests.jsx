"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://responsible-wonder-production.up.railway.app";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toInputDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function buildDates(openValue, closeValue) {
  if (!openValue || !closeValue) return [];

  const open = startOfDay(openValue);
  const close = startOfDay(closeValue);
  const today = startOfDay(new Date());
  const current = new Date(Math.max(open.getTime(), today.getTime()));
  const dates = [];

  while (current <= close) {
    dates.push(toInputDate(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function buildSlots(durationMinutes) {
  const duration = Number(durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const slots = [];
  let minutes = 7 * 60;
  const endLimit = 13 * 60;

  const fmt = (total) => {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  while (minutes + duration <= endLimit) {
    const end = minutes + duration;
    slots.push({
      start: fmt(minutes),
      end: fmt(end),
      label: `${fmt(minutes)} - ${fmt(end)}`,
    });
    minutes = end;
  }

  return slots;
}

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

function Card({ children, className = "", onClick }) {
  return (
    <div
      onClick={onClick}
      className={
        "bg-white rounded-2xl shadow-md border border-gray-200 p-5 md:p-6 " +
        className
      }
    >
      {children}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-5 md:px-7 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl md:text-2xl font-bold text-blue-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium"
          >
            Close
          </button>
        </div>
        <div className="p-5 md:p-7">{children}</div>
      </div>
    </div>
  );
}

export default function TestBatchStudentTests({ rollNo }) {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedTest, setSelectedTest] = useState(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [activeCard, setActiveCard] = useState(null);

  async function loadTests() {
    setLoading(true);
    try {
      const data = await api(
        "/test-batch/student-tests/" + encodeURIComponent(rollNo)
      );
      setTests(Array.isArray(data.tests) ? data.tests : []);
      setError("");
    } catch (err) {
      setError(err.message);
      setTests([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (rollNo) loadTests();
  }, [rollNo]);

  const openRegistration = (test) => {
    setSelectedTest(test);
    setSelectedDate(
      test.registered_writing_date
        ? toInputDate(test.registered_writing_date)
        : ""
    );

    if (test.registered_slot_start && test.registered_slot_end) {
      setSelectedSlot(
        `${test.registered_slot_start.slice(0, 5)}__${test.registered_slot_end.slice(0, 5)}`
      );
    } else {
      setSelectedSlot("");
    }

    setError("");
  };

  const closeRegistration = () => {
    if (saving) return;
    setSelectedTest(null);
    setSelectedDate("");
    setSelectedSlot("");
  };

  const register = async () => {
    if (!selectedTest || !selectedDate || !selectedSlot) {
      setError("Please select both a test date and a test slot.");
      return;
    }

    const slot = buildSlots(selectedTest.duration_minutes).find(
      (item) => `${item.start}__${item.end}` === selectedSlot
    );

    if (!slot) {
      setError("Please select a valid test slot.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await api(
        "/test-batch/tests/" +
          encodeURIComponent(selectedTest.test_code) +
          "/register",
        {
          method: "POST",
          body: JSON.stringify({
            roll_no: rollNo,
            writing_date: selectedDate,
            slot_start: slot.start,
            slot_end: slot.end,
          }),
        }
      );

      await loadTests();
      closeRegistration();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedDates = useMemo(
    () =>
      selectedTest
        ? buildDates(
            selectedTest.application_open_date,
            selectedTest.application_close_date
          )
        : [],
    [selectedTest]
  );

  const slots = useMemo(
    () => (selectedTest ? buildSlots(selectedTest.duration_minutes) : []),
    [selectedTest]
  );

  const registeredTests = tests.filter(
    (test) => test.is_registered === true || test.is_registered === "true"
  );

  const availableTests = tests.filter(
    (test) => !(test.is_registered === true || test.is_registered === "true")
  );

  function renderRegistrationContent() {
    return (
      <>
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-gray-500">Loading available tests...</p>
        ) : availableTests.length === 0 ? (
          <p className="text-gray-500">
            No tests are currently available for registration.
          </p>
        ) : (
          <div className="space-y-4">
            {availableTests.map((test) => {
              const dates = buildDates(
                test.application_open_date,
                test.application_close_date
              );
              const registrationClosed =
                dates.length === 0 ||
                startOfDay(new Date()) >
                  startOfDay(test.application_close_date);

              return (
                <div
                  key={test.test_code}
                  className="border border-gray-200 rounded-xl p-4"
                >
                  <h3 className="text-lg font-semibold text-blue-700">
                    {test.test_code}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 mt-2">
                    <p>
                      <span className="font-medium">Subject:</span>{" "}
                      {test.subject_name || "-"}
                    </p>
                    <p>
                      <span className="font-medium">Test Series:</span>{" "}
                      {test.test_series_name || "-"}
                    </p>
                    <p>
                      <span className="font-medium">Duration:</span>{" "}
                      {test.duration_minutes} mins
                    </p>
                    <p>
                      <span className="font-medium">Total Marks:</span>{" "}
                      {test.total_marks}
                    </p>
                    <p className="md:col-span-2">
                      <span className="font-medium">Registration:</span>{" "}
                      {formatDate(test.application_open_date)} -{" "}
                      {formatDate(test.application_close_date)}
                    </p>
                  </div>

                  {test.portion && (
                    <p className="text-sm text-gray-600 mt-2">
                      <span className="font-medium">Portion:</span>{" "}
                      {test.portion}
                    </p>
                  )}
                  {test.chapter && (
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-medium">Chapter:</span>{" "}
                      {test.chapter}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => openRegistration(test)}
                    disabled={registrationClosed || !dates.length}
                    className="mt-4 w-full bg-blue-700 text-white px-5 py-2 rounded-lg hover:bg-blue-800 disabled:opacity-50"
                  >
                    Register
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  function renderScheduleContent() {
    if (loading) {
      return <p className="text-gray-500">Loading schedule...</p>;
    }

    if (registeredTests.length === 0) {
      return <p className="text-gray-500">No tests have been registered yet.</p>;
    }

    return (
      <div className="space-y-4">
        {registeredTests.map((test) => (
          <div
            key={test.test_code}
            className="border border-green-200 bg-green-50 rounded-xl p-4"
          >
            <h3 className="text-lg font-semibold text-blue-700">
              {test.test_code}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700 mt-2">
              <p>
                <span className="font-medium">Subject:</span>{" "}
                {test.subject_name || "-"}
              </p>
              <p>
                <span className="font-medium">Test Series:</span>{" "}
                {test.test_series_name || "-"}
              </p>
              <p>
                <span className="font-medium">Duration:</span>{" "}
                {test.duration_minutes} mins
              </p>
              <p>
                <span className="font-medium">Total Marks:</span>{" "}
                {test.total_marks}
              </p>
            </div>

            <div className="mt-4 rounded-lg bg-white border border-green-200 px-4 py-3 text-sm text-green-800">
              <p className="font-semibold">Registration confirmed</p>
              <p>Date: {formatDate(test.registered_writing_date)}</p>
              <p>
                Slot:{" "}
                {test.registered_slot_start && test.registered_slot_end
                  ? `${test.registered_slot_start.slice(0, 5)} - ${test.registered_slot_end.slice(0, 5)}`
                  : "-"}
              </p>
              <p className="mt-1 text-xs">
                Date and slot cannot be changed after registration.
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="contents">
        <button
          type="button"
          onClick={() => setActiveCard("registration")}
          className="text-left bg-white rounded-2xl shadow-md border border-gray-200 p-5 md:p-6 hover:shadow-lg hover:border-blue-300 transition-all min-h-[150px]"
        >
          <p className="text-sm text-gray-500">Test Batch</p>
          <h2 className="text-xl md:text-2xl font-bold text-blue-800 mt-1">
            Test Registration
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            Register for available tests.
          </p>
          <div className="mt-5 flex items-center justify-between">
            <span className="text-sm font-semibold text-blue-700">
              {loading ? "Loading..." : `${availableTests.length} available test${availableTests.length === 1 ? "" : "s"}`}
            </span>
            <span className="text-blue-700 font-semibold">Open</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveCard("schedule")}
          className="text-left bg-white rounded-2xl shadow-md border border-gray-200 p-5 md:p-6 hover:shadow-lg hover:border-blue-300 transition-all min-h-[150px]"
        >
          <p className="text-sm text-gray-500">Test Batch</p>
          <h2 className="text-xl md:text-2xl font-bold text-blue-800 mt-1">
            Test Schedule
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            View your confirmed test dates and slots.
          </p>
          <div className="mt-5 flex items-center justify-between">
            <span className="text-sm font-semibold text-blue-700">
              {loading ? "Loading..." : `${registeredTests.length} registered test${registeredTests.length === 1 ? "" : "s"}`}
            </span>
            <span className="text-blue-700 font-semibold">Open</span>
          </div>
        </button>
      </div>

      {activeCard === "registration" && (
        <Modal title="Test Registration" onClose={() => setActiveCard(null)}>
          <p className="text-sm text-gray-500 mb-5">
            Register only for tests available to your Test Batch and Test Series.
          </p>
          {renderRegistrationContent()}
        </Modal>
      )}

      {activeCard === "schedule" && (
        <Modal
          title="Test Batch – Test Schedule"
          onClose={() => setActiveCard(null)}
        >
          <p className="text-sm text-gray-500 mb-5">
            Your confirmed Test Batch tests and assigned dates and slots.
          </p>
          {renderScheduleContent()}
        </Modal>
      )}

      {selectedTest && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-semibold text-blue-800">
              Select Test Date & Slot
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {selectedTest.test_code} · {selectedTest.subject_name}
            </p>

            <div className="mt-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Test Date
              </label>
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 bg-white"
              >
                <option value="">Select date</option>
                {selectedDates.map((date) => (
                  <option key={date} value={date}>
                    {formatDate(date)}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Test Slot
              </label>
              <select
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 bg-white"
              >
                <option value="">Select slot</option>
                {slots.map((slot) => (
                  <option
                    key={slot.start + slot.end}
                    value={`${slot.start}__${slot.end}`}
                  >
                    {slot.label}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs text-gray-500 mt-4">
              Available dates are limited to the configured registration
              window. The test duration determines the available slots.
            </p>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={closeRegistration}
                disabled={saving}
                className="px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={register}
                disabled={saving || !selectedDate || !selectedSlot}
                className="px-5 py-2 rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Confirm Registration"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
