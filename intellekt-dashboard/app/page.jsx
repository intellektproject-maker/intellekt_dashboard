"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  MapPin,
  Mail,
  Phone,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
} from "lucide-react";

const cards = [
  {
    title: (
      <>
        Premium Coaching Center
        <br />
        for Science stream
        <br />
        Mathematics and Physics
      </>
    ),
    description: "Empowering the Future of Academic Excellence",
    image: "/Intellekt-AI.png",
    alt: "Academic excellence",
  },
  {
    title: <>About Us</>,
    description:
      "Intellekt Academy is a premium coaching center specializing in Mathematics and Physics for higher secondary students. We provide concept-oriented coaching for students across all major boards. Our teaching focuses on clarity, analytical thinking, and academic excellence. We aim to build strong foundations for engineering, science, and future technical careers. At Intellekt Academy, we nurture confident learners prepared for tomorrow’s challenges.",
    image: "/intellekt-about.png",
    alt: "About Intellekt Academy",
  },
];

const API_BASE =
  "https://responsible-wonder-production.up.railway.app";

export default function Home() {
  const router = useRouter();

  const [currentCard, setCurrentCard] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const contactRef = useRef(null);
  const enquiryRef = useRef(null);

  const [formData, setFormData] = useState({
    studentName: "",
    className: "",
    board: "",
    schoolName: "",
    subjects: "",
    academicYearFrom: "",
    academicYearTo: "",
    modeOfEducation: "",
    parentName: "",
    mobileNumber: "",
    secondaryContact: "",
    area: "",
    reference: "",
  });

  const [phoneError, setPhoneError] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentCard((prev) => (prev + 1) % cards.length);
    }, 110000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };

    window.addEventListener("scroll", handleScroll);

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const goPrev = () => {
    setCurrentCard((prev) => (prev - 1 + cards.length) % cards.length);
  };

  const goNext = () => {
    setCurrentCard((prev) => (prev + 1) % cards.length);
  };

  const scrollToSection = (ref) => {
    if (!ref.current) return;

    const headerOffset = 140;

    const elementPosition =
      ref.current.getBoundingClientRect().top + window.pageYOffset;

    window.scrollTo({
      top: elementPosition - headerOffset,
      behavior: "smooth",
    });
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const sanitizeName = (value) => {
    return value
      .replace(/[^A-Za-z\s]/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^\s+/, "");
  };

  const sanitizeSchoolName = (value) => {
    return value
      .replace(/[^A-Za-z0-9\s.,&()'-]/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^\s+/, "");
  };

  const sanitizeArea = (value) => {
    return value
      .replace(/[^A-Za-z0-9\s,.-]/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^\s+/, "");
  };

  const sanitizePhone = (value) => {
    return value.replace(/\D/g, "").slice(0, 10);
  };

  const sanitizeReference = (value) => {
    return value
      .replace(/[^A-Za-z0-9\s.,&()'-]/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^\s+/, "");
  };

  const sanitizeYear = (value) => {
    return value.replace(/\D/g, "").slice(0, 4);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    let cleanedValue = value;

    if (name === "studentName" || name === "parentName") {
      cleanedValue = sanitizeName(value);
    } else if (name === "schoolName") {
      cleanedValue = sanitizeSchoolName(value);
    } else if (name === "area") {
      cleanedValue = sanitizeArea(value);
    } else if (name === "reference") {
      cleanedValue = sanitizeReference(value);
    } else if (
      name === "academicYearFrom" ||
      name === "academicYearTo"
    ) {
      cleanedValue = sanitizeYear(value);
    } else if (name === "mobileNumber") {
      cleanedValue = sanitizePhone(value);

      if (cleanedValue.length > 0 && cleanedValue.length !== 10) {
        setPhoneError(
          "Phone number must contain exactly 10 digits"
        );
      } else {
        setPhoneError("");
      }
    } else if (name === "secondaryContact") {
      cleanedValue = sanitizePhone(value);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: cleanedValue,
    }));
  };

  const validateForm = () => {
    const studentName = formData.studentName.trim();
    const parentName = formData.parentName.trim();
    const schoolName = formData.schoolName.trim();
    const area = formData.area.trim();
    const mobileNumber = formData.mobileNumber.trim();
    const secondaryContact =
      formData.secondaryContact.trim();
    const academicYearFrom =
      formData.academicYearFrom.trim();
    const academicYearTo =
      formData.academicYearTo.trim();

    if (
      !studentName ||
      !/^[A-Za-z\s]+$/.test(studentName)
    ) {
      alert(
        "Student name should contain only letters and spaces."
      );
      return false;
    }

    if (!formData.className) {
      alert("Please select class.");
      return false;
    }

    if (!formData.board) {
      alert("Please select board.");
      return false;
    }

    if (
      !schoolName ||
      !/^[A-Za-z0-9\s.,&()'-]+$/.test(schoolName)
    ) {
      alert(
        "School name should not be empty and should contain only valid characters."
      );
      return false;
    }

    if (!formData.subjects) {
      alert("Please select subject.");
      return false;
    }

    if (!/^\d{4}$/.test(academicYearFrom)) {
      alert("Academic Year From must contain 4 digits.");
      return false;
    }

    if (!/^\d{4}$/.test(academicYearTo)) {
      alert("Academic Year To must contain 4 digits.");
      return false;
    }

    if (
      Number(academicYearTo) <=
      Number(academicYearFrom)
    ) {
      alert(
        "Academic Year To must be greater than From."
      );
      return false;
    }

    if (!formData.modeOfEducation) {
      alert("Please select mode of education.");
      return false;
    }

    if (
      !parentName ||
      !/^[A-Za-z\s]+$/.test(parentName)
    ) {
      alert(
        "Parent name should contain only letters and spaces."
      );
      return false;
    }

    if (!/^\d{10}$/.test(mobileNumber)) {
      setPhoneError(
        "Phone number must contain exactly 10 digits"
      );

      alert(
        "Phone number must contain exactly 10 digits."
      );

      return false;
    }

    if (!secondaryContact) {
      alert("Secondary contact is required.");
      return false;
    }

    if (!/^\d{10}$/.test(secondaryContact)) {
      alert(
        "Secondary contact must contain exactly 10 digits."
      );

      return false;
    }

    if (secondaryContact === mobileNumber) {
      alert(
        "Primary and Secondary contact numbers cannot be the same."
      );

      return false;
    }

    if (
      !area ||
      !/^[A-Za-z0-9\s,.-]+$/.test(area)
    ) {
      alert(
        "Area should contain only valid characters."
      );

      return false;
    }

    return true;
  };

  const handleEnquirySubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    const classBoard = `${formData.board}-${formData.className}`;

    try {
      const res = await fetch(`${API_BASE}/enquiries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentName: formData.studentName.trim(),
          classBoard,
          schoolName: formData.schoolName.trim(),
          subjects: formData.subjects,
          academicYearFrom:
            formData.academicYearFrom.trim(),
          academicYearTo:
            formData.academicYearTo.trim(),
          modeOfEducation:
            formData.modeOfEducation,
          parentName: formData.parentName.trim(),
          mobileNumber:
            formData.mobileNumber.trim(),
          secondaryContact:
            formData.secondaryContact.trim(),
          area: formData.area.trim(),
          reference: formData.reference.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(
          data.message ||
            data.error ||
            "Failed to submit enquiry"
        );
        return;
      }

      alert("Enquiry submitted successfully!");

      setFormData({
        studentName: "",
        className: "",
        board: "",
        schoolName: "",
        subjects: "",
        academicYearFrom: "",
        academicYearTo: "",
        modeOfEducation: "",
        parentName: "",
        mobileNumber: "",
        secondaryContact: "",
        area: "",
        reference: "",
      });

      setPhoneError("");
    } catch (error) {
      console.error("Enquiry error:", error);
      alert("Server error while submitting enquiry");
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f4f6fb] scroll-smooth">
      {/* YOUR EXISTING HEADER + HERO + CAROUSEL SECTION */}

      {/* CONTACT + VISION + ENQUIRY */}
      <section className="px-4 sm:px-6 md:px-12 lg:px-16 pb-16 md:pb-24">
        <div className="max-w-7xl mx-auto space-y-14">

          {/* WHY INTELLEKT WORKS */}
          <div className="text-center">
            <h2 className="text-4xl sm:text-5xl font-bold text-[#111827] mb-14">
              Why Intellekt Works
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-5xl mx-auto">

              <div className="bg-white rounded-[28px] p-8 shadow-sm border border-gray-100 hover:shadow-lg transition duration-300">
                <div className="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mx-auto mb-6">
                  <span className="text-3xl">📘</span>
                </div>

                <h3 className="text-2xl font-semibold text-[#111827] mb-4">
                  Personalized Learning
                </h3>

                <p className="text-gray-600 leading-relaxed text-lg">
                  Students learn at their own pace with concept-focused teaching,
                  helping them strengthen fundamentals and build confidence in
                  Mathematics and Physics.
                </p>
              </div>

              <div className="bg-white rounded-[28px] p-8 shadow-sm border border-gray-100 hover:shadow-lg transition duration-300">
                <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-6">
                  <span className="text-3xl">🚀</span>
                </div>

                <h3 className="text-2xl font-semibold text-[#111827] mb-4">
                  Future-Focused Guidance
                </h3>

                <p className="text-gray-600 leading-relaxed text-lg">
                  We prepare students for higher education and competitive academic
                  environments through analytical thinking, mentoring, and strategic
                  preparation.
                </p>
              </div>

            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">

            {/* CONTACT */}
            <div
              ref={contactRef}
              className="bg-white rounded-[30px] shadow-md p-6 sm:p-8 md:p-10 scroll-mt-32 border border-gray-100"
            >
              <h2 className="text-3xl font-bold text-[#111827] mb-8">
                Contact Us
              </h2>

              <div className="space-y-8">

                <div className="flex items-start gap-4">
                  <Mail className="w-5 h-5 text-blue-700" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800 mb-1">
                      Email
                    </p>
                    <p className="text-gray-600">
                      support@intellekt.com
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <Phone className="w-5 h-5 text-blue-700" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800 mb-1">
                      Phone
                    </p>
                    <p className="text-gray-600">
                      +91 98765 43210
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <MapPin className="w-5 h-5 text-blue-700" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800 mb-1">
                      Location
                    </p>

                    <a
                      href="https://maps.app.goo.gl/B4JhSmtsjJsx9ixT9"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-700 hover:text-blue-900"
                    >
                      View on Google Maps
                    </a>
                  </div>
                </div>

              </div>
            </div>

            {/* VISION & MISSION */}
            <div className="bg-white rounded-[30px] shadow-md p-6 sm:p-8 md:p-10 border border-gray-100">

              <h2 className="text-3xl font-bold text-[#111827] mb-10 text-center">
                Vision & Mission
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                <div className="rounded-3xl bg-[#f8fbff] border border-blue-100 p-6">
                  <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mb-5">
                    <span className="text-2xl">🎯</span>
                  </div>

                  <h3 className="text-2xl font-bold text-[#0b1f5f] mb-4">
                    Vision
                  </h3>

                  <p className="text-gray-600 text-lg leading-relaxed">
                    To create a generation of INTELLEKTUALS who lead with logic,
                    creativity, and academic excellence.
                  </p>
                </div>

                <div className="rounded-3xl bg-[#fffaf5] border border-orange-100 p-6">
                  <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center mb-5">
                    <span className="text-2xl">🌟</span>
                  </div>

                  <h3 className="text-2xl font-bold text-[#0b1f5f] mb-4">
                    Mission
                  </h3>

                  <p className="text-gray-600 text-lg leading-relaxed">
                    To inspire students to achieve their highest potential in
                    Mathematics and Physics through innovative teaching,
                    strategic guidance, and personal mentoring.
                  </p>
                </div>

              </div>
            </div>

            {/* ENQUIRY */}
            <div
              ref={enquiryRef}
              className="bg-white rounded-[30px] shadow-md p-6 sm:p-8 md:p-10 scroll-mt-32 border border-gray-100"
            >
              <h2 className="text-3xl font-bold text-[#111827] mb-8">
                Enquiry
              </h2>

              <form
                onSubmit={handleEnquirySubmit}
                className="space-y-4"
              >
                {/* KEEP YOUR EXISTING FORM FIELDS HERE */}

                <button
                  type="submit"
                  className="w-full bg-blue-700 text-white py-3 rounded-xl font-semibold hover:bg-blue-800 transition"
                >
                  Submit Enquiry
                </button>
              </form>
            </div>

          </div>
        </div>
      </section>

      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 bg-blue-700 hover:bg-blue-800 text-white rounded-full p-3 shadow-lg transition"
          aria-label="Scroll to top"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

