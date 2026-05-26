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
  BookOpen,
  Rocket,
  Target,
  Star,
  GraduationCap,
  Users,
  Award,
  Atom,
} from "lucide-react";

const cards = [
  {
    title: (
      <>
        Premium Coaching Center
        <br />
        for Science Stream
        <br />
        Mathematics and Physics
      </>
    ),
    description: "Empowering the Future of Academic Excellence",
    image: "/Intellekt-AI.png",
    alt: "Academic excellence",
    badge: "Est. 2020",
  },
  {
    title: <>About Us</>,
    description:
      "Intellekt Academy is a premium coaching center specializing in Mathematics and Physics for higher secondary students. We provide concept-oriented coaching for students across all major boards. Our teaching focuses on clarity, analytical thinking, and academic excellence. We aim to build strong foundations for engineering, science, and future technical careers. At Intellekt Academy, we nurture confident learners prepared for tomorrow's challenges.",
    image: "/intellekt-about.png",
    alt: "About Intellekt Academy",
    badge: "Our Story",
  },
];

const stats = [
  { icon: <GraduationCap className="w-6 h-6" />, value: "500+", label: "Students Trained" },
  { icon: <Award className="w-6 h-6" />, value: "95%", label: "Success Rate" },
  { icon: <Users className="w-6 h-6" />, value: "10+", label: "Expert Faculty" },
  { icon: <BookOpen className="w-6 h-6" />, value: "5+", label: "Years of Excellence" },
];

const API_BASE = "https://responsible-wonder-production.up.railway.app";

export default function Home() {
  const router = useRouter();

  const [currentCard, setCurrentCard] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);

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

  const navigate = (dir) => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => {
      setCurrentCard((prev) =>
        dir === "prev"
          ? (prev - 1 + cards.length) % cards.length
          : (prev + 1) % cards.length
      );
      setAnimating(false);
    }, 300);
  };

  const goPrev = () => navigate("prev");
  const goNext = () => navigate("next");

  const scrollToSection = (ref) => {
    if (!ref.current) return;
    const headerOffset = 140;
    const elementPosition =
      ref.current.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo({ top: elementPosition - headerOffset, behavior: "smooth" });
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const sanitizeName = (v) =>
    v.replace(/[^A-Za-z\s]/g, "").replace(/\s{2,}/g, " ").replace(/^\s+/, "");
  const sanitizeSchoolName = (v) =>
    v.replace(/[^A-Za-z0-9\s.,&()'-]/g, "").replace(/\s{2,}/g, " ").replace(/^\s+/, "");
  const sanitizeArea = (v) =>
    v.replace(/[^A-Za-z0-9\s,.-]/g, "").replace(/\s{2,}/g, " ").replace(/^\s+/, "");
  const sanitizePhone = (v) => v.replace(/\D/g, "").slice(0, 10);
  const sanitizeReference = (v) =>
    v.replace(/[^A-Za-z0-9\s.,&()'-]/g, "").replace(/\s{2,}/g, " ").replace(/^\s+/, "");
  const sanitizeYear = (v) => v.replace(/\D/g, "").slice(0, 4);

  const handleChange = (
    e
  ) => {
    const { name, value } = e.target;
    let cleanedValue = value;

    if (name === "studentName" || name === "parentName") cleanedValue = sanitizeName(value);
    else if (name === "schoolName") cleanedValue = sanitizeSchoolName(value);
    else if (name === "area") cleanedValue = sanitizeArea(value);
    else if (name === "reference") cleanedValue = sanitizeReference(value);
    else if (name === "academicYearFrom" || name === "academicYearTo") cleanedValue = sanitizeYear(value);
    else if (name === "mobileNumber") {
      cleanedValue = sanitizePhone(value);
      setPhoneError(cleanedValue.length > 0 && cleanedValue.length !== 10
        ? "Phone number must contain exactly 10 digits" : "");
    } else if (name === "secondaryContact") {
      cleanedValue = sanitizePhone(value);
    }

    setFormData((prev) => ({ ...prev, [name]: cleanedValue }));
  };

  const validateForm = () => {
    const {
      studentName, className, board, schoolName, subjects,
      academicYearFrom, academicYearTo, modeOfEducation,
      parentName, mobileNumber, secondaryContact, area,
    } = formData;

    if (!studentName.trim() || !/^[A-Za-z\s]+$/.test(studentName.trim())) {
      alert("Student name should contain only letters and spaces."); return false;
    }
    if (!className) { alert("Please select class."); return false; }
    if (!board) { alert("Please select board."); return false; }
    if (!schoolName.trim() || !/^[A-Za-z0-9\s.,&()'-]+$/.test(schoolName.trim())) {
      alert("School name should not be empty and should contain only valid characters."); return false;
    }
    if (!subjects) { alert("Please select subject."); return false; }
    if (!/^\d{4}$/.test(academicYearFrom.trim())) {
      alert("Academic Year From must contain 4 digits."); return false;
    }
    if (!/^\d{4}$/.test(academicYearTo.trim())) {
      alert("Academic Year To must contain 4 digits."); return false;
    }
    if (Number(academicYearTo) <= Number(academicYearFrom)) {
      alert("Academic Year To must be greater than From."); return false;
    }
    if (!modeOfEducation) { alert("Please select mode of education."); return false; }
    if (!parentName.trim() || !/^[A-Za-z\s]+$/.test(parentName.trim())) {
      alert("Parent name should contain only letters and spaces."); return false;
    }
    if (!/^\d{10}$/.test(mobileNumber.trim())) {
      setPhoneError("Phone number must contain exactly 10 digits");
      alert("Phone number must contain exactly 10 digits."); return false;
    }
    if (!secondaryContact) { alert("Secondary contact is required."); return false; }
    if (!/^\d{10}$/.test(secondaryContact.trim())) {
      alert("Secondary contact must contain exactly 10 digits."); return false;
    }
    if (secondaryContact === mobileNumber) {
      alert("Primary and Secondary contact numbers cannot be the same."); return false;
    }
    if (!area.trim() || !/^[A-Za-z0-9\s,.-]+$/.test(area.trim())) {
      alert("Area should contain only valid characters."); return false;
    }
    return true;
  };

  const handleEnquirySubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setFormSubmitting(true);
    const classBoard = `${formData.board}-${formData.className}`;

    try {
      const res = await fetch(`${API_BASE}/enquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: formData.studentName.trim(),
          classBoard,
          schoolName: formData.schoolName.trim(),
          subjects: formData.subjects,
          academicYearFrom: formData.academicYearFrom.trim(),
          academicYearTo: formData.academicYearTo.trim(),
          modeOfEducation: formData.modeOfEducation,
          parentName: formData.parentName.trim(),
          mobileNumber: formData.mobileNumber.trim(),
          secondaryContact: formData.secondaryContact.trim(),
          area: formData.area.trim(),
          reference: formData.reference.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || data.error || "Failed to submit enquiry");
        return;
      }

      setFormSuccess(true);
      setTimeout(() => setFormSuccess(false), 4000);
      setFormData({
        studentName: "", className: "", board: "", schoolName: "",
        subjects: "", academicYearFrom: "", academicYearTo: "",
        modeOfEducation: "", parentName: "", mobileNumber: "",
        secondaryContact: "", area: "", reference: "",
      });
      setPhoneError("");
    } catch (error) {
      console.error("Enquiry error:", error);
      alert("Server error while submitting enquiry");
    } finally {
      setFormSubmitting(false);
    }
  };

  const inputClass =
    "w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-[#f8faff] text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition placeholder:text-gray-400";

  const selectClass =
    "w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-[#f8faff] text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition appearance-none cursor-pointer";

  const labelClass = "block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap');

        :root {
          --navy: #0b1f5f;
          --blue: #1a3cb3;
          --blue-light: #3a5fd9;
          --accent: #f97316;
          --accent-light: #fff4ed;
          --surface: #f4f6fb;
          --card: #ffffff;
          --text: #111827;
          --muted: #6b7280;
        }

        * { box-sizing: border-box; }

        body {
          font-family: 'DM Sans', sans-serif;
          background: var(--surface);
        }

        .display-font { font-family: 'Playfair Display', serif; }

        /* Navbar */
        .navbar {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(255,255,255,0.92);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(26,60,179,0.08);
          box-shadow: 0 2px 20px rgba(11,31,95,0.06);
        }

        .nav-inner {
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 2rem;
          height: 72px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .nav-logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-icon {
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, var(--navy) 0%, var(--blue-light) 100%);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .logo-text {
          font-family: 'Playfair Display', serif;
          font-size: 1.4rem;
          font-weight: 900;
          color: var(--navy);
          letter-spacing: -0.02em;
        }

        .logo-sub {
          font-size: 0.68rem;
          color: var(--muted);
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-top: -2px;
        }

        .nav-links {
          display: flex;
          align-items: center;
          gap: 2rem;
          list-style: none;
          margin: 0; padding: 0;
        }

        .nav-links a {
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--text);
          text-decoration: none;
          position: relative;
          padding-bottom: 2px;
          transition: color 0.2s;
        }

        .nav-links a::after {
          content: '';
          position: absolute;
          bottom: -2px; left: 0;
          width: 0; height: 2px;
          background: var(--blue);
          border-radius: 2px;
          transition: width 0.25s ease;
        }

        .nav-links a:hover { color: var(--blue); }
        .nav-links a:hover::after { width: 100%; }

        .nav-cta {
          background: linear-gradient(135deg, var(--navy) 0%, var(--blue-light) 100%);
          color: white !important;
          padding: 0.55rem 1.4rem;
          border-radius: 10px;
          font-weight: 600 !important;
          font-size: 0.88rem !important;
          transition: transform 0.2s, box-shadow 0.2s !important;
          box-shadow: 0 4px 14px rgba(26,60,179,0.25);
        }

        .nav-cta:hover {
          transform: translateY(-1px) !important;
          box-shadow: 0 6px 20px rgba(26,60,179,0.35) !important;
        }

        .nav-cta::after { display: none !important; }

        /* Hero */
        .hero {
          background: linear-gradient(135deg, #0b1f5f 0%, #1a3cb3 55%, #3a5fd9 100%);
          position: relative;
          overflow: hidden;
          padding: 80px 2rem 90px;
          min-height: 560px;
          display: flex;
          align-items: center;
        }

        .hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 60% 80% at 80% 20%, rgba(249,115,22,0.12) 0%, transparent 60%),
            radial-gradient(ellipse 40% 60% at 10% 80%, rgba(255,255,255,0.04) 0%, transparent 60%);
        }

        .hero-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
        }

        .hero-blob {
          position: absolute;
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(249,115,22,0.15) 0%, transparent 70%);
          right: -100px; top: -100px;
          border-radius: 50%;
          animation: blob-float 8s ease-in-out infinite alternate;
        }

        @keyframes blob-float {
          0% { transform: translate(0,0) scale(1); }
          100% { transform: translate(-30px, 30px) scale(1.08); }
        }

        .hero-inner {
          position: relative;
          z-index: 2;
          max-width: 1280px;
          margin: 0 auto;
          width: 100%;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 60px;
          align-items: center;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(255,255,255,0.12);
          border: 1px solid rgba(255,255,255,0.2);
          padding: 6px 16px;
          border-radius: 100px;
          margin-bottom: 24px;
          font-size: 0.8rem;
          color: rgba(255,255,255,0.9);
          letter-spacing: 0.05em;
          text-transform: uppercase;
          font-weight: 500;
          backdrop-filter: blur(8px);
        }

        .hero-badge-dot {
          width: 7px; height: 7px;
          background: #f97316;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
        }

        .hero-title {
          font-family: 'Playfair Display', serif;
          font-size: clamp(2.2rem, 4vw, 3.4rem);
          font-weight: 900;
          color: white;
          line-height: 1.12;
          letter-spacing: -0.02em;
          margin-bottom: 20px;
        }

        .hero-title span {
          background: linear-gradient(90deg, #fbbf24, #f97316);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .hero-desc {
          color: rgba(255,255,255,0.72);
          font-size: 1.05rem;
          line-height: 1.7;
          margin-bottom: 36px;
          max-width: 480px;
        }

        .hero-actions {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
        }

        .btn-primary {
          background: linear-gradient(135deg, #f97316, #ea580c);
          color: white;
          padding: 0.8rem 2rem;
          border-radius: 12px;
          font-weight: 600;
          font-size: 0.95rem;
          border: none;
          cursor: pointer;
          box-shadow: 0 6px 20px rgba(249,115,22,0.4);
          transition: transform 0.2s, box-shadow 0.2s;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 28px rgba(249,115,22,0.5);
        }

        .btn-ghost {
          background: rgba(255,255,255,0.1);
          color: white;
          padding: 0.8rem 2rem;
          border-radius: 12px;
          font-weight: 500;
          font-size: 0.95rem;
          border: 1px solid rgba(255,255,255,0.2);
          cursor: pointer;
          backdrop-filter: blur(8px);
          transition: background 0.2s, transform 0.2s;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
        }

        .btn-ghost:hover {
          background: rgba(255,255,255,0.18);
          transform: translateY(-2px);
        }

        .hero-card {
          background: rgba(255,255,255,0.08);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 28px;
          padding: 36px;
          color: white;
        }

        .hero-subjects {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-top: 28px;
        }

        .subject-pill {
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 14px;
          padding: 16px;
          text-align: center;
          transition: background 0.2s, transform 0.2s;
        }

        .subject-pill:hover {
          background: rgba(255,255,255,0.18);
          transform: translateY(-2px);
        }

        .subject-pill .icon { font-size: 1.8rem; margin-bottom: 8px; }
        .subject-pill .name { font-size: 0.9rem; font-weight: 600; }
        .subject-pill .tag { font-size: 0.72rem; color: rgba(255,255,255,0.6); margin-top: 2px; }

        /* Stats Strip */
        .stats-strip {
          background: white;
          border-bottom: 1px solid rgba(26,60,179,0.06);
          padding: 28px 2rem;
          box-shadow: 0 4px 24px rgba(11,31,95,0.06);
        }

        .stats-inner {
          max-width: 1280px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 0 32px;
          position: relative;
        }

        .stat-item:not(:last-child)::after {
          content: '';
          position: absolute;
          right: 0; top: 15%; bottom: 15%;
          width: 1px;
          background: rgba(26,60,179,0.1);
        }

        .stat-icon {
          width: 48px; height: 48px;
          background: linear-gradient(135deg, #e8eeff, #dce6ff);
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--blue);
          flex-shrink: 0;
        }

        .stat-value {
          font-family: 'Playfair Display', serif;
          font-size: 1.8rem;
          font-weight: 900;
          color: var(--navy);
          line-height: 1;
        }

        .stat-label {
          font-size: 0.8rem;
          color: var(--muted);
          font-weight: 500;
          margin-top: 2px;
        }

        /* Carousel */
        .carousel-section {
          padding: 70px 2rem 0;
          max-width: 1280px;
          margin: 0 auto;
        }

        .section-tag {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--blue);
          background: #e8eeff;
          padding: 6px 14px;
          border-radius: 100px;
          margin-bottom: 14px;
        }

        .carousel-wrap {
          position: relative;
          background: linear-gradient(135deg, var(--navy) 0%, var(--blue-light) 100%);
          border-radius: 32px;
          overflow: hidden;
          min-height: 380px;
          display: flex;
          align-items: stretch;
          box-shadow: 0 20px 60px rgba(11,31,95,0.2);
        }

        .carousel-wrap::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 50% 80% at 100% 50%, rgba(249,115,22,0.15) 0%, transparent 60%);
        }

        .carousel-slide {
          position: relative;
          z-index: 1;
          width: 100%;
          display: grid;
          grid-template-columns: 1fr 1fr;
          align-items: center;
          padding: 52px 60px;
          gap: 48px;
          opacity: 1;
          transition: opacity 0.3s ease;
        }

        .carousel-slide.fade { opacity: 0; }

        .carousel-badge {
          display: inline-flex;
          align-items: center;
          background: rgba(249,115,22,0.2);
          border: 1px solid rgba(249,115,22,0.4);
          color: #fed7aa;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 5px 12px;
          border-radius: 100px;
          margin-bottom: 18px;
        }

        .carousel-title {
          font-family: 'Playfair Display', serif;
          font-size: clamp(1.5rem, 3vw, 2.4rem);
          font-weight: 900;
          color: white;
          line-height: 1.2;
          margin-bottom: 16px;
        }

        .carousel-desc {
          color: rgba(255,255,255,0.72);
          font-size: 0.97rem;
          line-height: 1.75;
        }

        .carousel-img {
          border-radius: 20px;
          overflow: hidden;
          aspect-ratio: 4/3;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .carousel-controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-top: 28px;
        }

        .carousel-btn {
          width: 44px; height: 44px;
          background: white;
          border: none;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--navy);
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(11,31,95,0.12);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .carousel-btn:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 20px rgba(11,31,95,0.18);
        }

        .carousel-dot {
          width: 8px; height: 8px;
          background: rgba(255,255,255,0.3);
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.3s;
          border: none;
        }

        .carousel-dot.active {
          background: white;
          width: 28px;
          border-radius: 4px;
        }

        /* Why Section */
        .why-section { padding: 80px 2rem 0; }

        .section-header {
          text-align: center;
          margin-bottom: 52px;
        }

        .section-title {
          font-family: 'Playfair Display', serif;
          font-size: clamp(2rem, 4vw, 3rem);
          font-weight: 900;
          color: var(--navy);
          line-height: 1.15;
          margin-bottom: 14px;
        }

        .section-subtitle {
          color: var(--muted);
          font-size: 1.05rem;
          max-width: 520px;
          margin: 0 auto;
          line-height: 1.65;
        }

        .why-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
          max-width: 900px;
          margin: 0 auto;
        }

        .why-card {
          background: white;
          border-radius: 28px;
          padding: 36px;
          border: 1px solid rgba(26,60,179,0.07);
          box-shadow: 0 4px 20px rgba(11,31,95,0.05);
          transition: transform 0.3s, box-shadow 0.3s;
          position: relative;
          overflow: hidden;
        }

        .why-card::after {
          content: '';
          position: absolute;
          bottom: 0; right: 0;
          width: 100px; height: 100px;
          background: radial-gradient(circle, rgba(26,60,179,0.04) 0%, transparent 70%);
        }

        .why-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(11,31,95,0.1);
        }

        .why-icon {
          width: 60px; height: 60px;
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.7rem;
          margin-bottom: 20px;
        }

        .why-icon.pink { background: #fff0f7; }
        .why-icon.orange { background: #fff4ed; }
        .why-icon.blue { background: #e8eeff; }
        .why-icon.green { background: #f0fdf4; }

        .why-title {
          font-family: 'Playfair Display', serif;
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--navy);
          margin-bottom: 12px;
        }

        .why-text {
          color: var(--muted);
          line-height: 1.72;
          font-size: 0.95rem;
        }

        /* Bottom Section */
        .bottom-section {
          padding: 70px 2rem 80px;
        }

        .bottom-grid {
          max-width: 1280px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1.4fr 1.3fr;
          gap: 24px;
          align-items: start;
        }

        /* Contact Card */
        .contact-card {
          background: linear-gradient(160deg, var(--navy) 0%, #1a3cb3 100%);
          border-radius: 30px;
          padding: 36px;
          color: white;
          box-shadow: 0 12px 40px rgba(11,31,95,0.22);
          position: relative;
          overflow: hidden;
        }

        .contact-card::before {
          content: '';
          position: absolute;
          top: -60px; right: -60px;
          width: 200px; height: 200px;
          background: radial-gradient(circle, rgba(249,115,22,0.15) 0%, transparent 70%);
          border-radius: 50%;
        }

        .contact-card h2 {
          font-family: 'Playfair Display', serif;
          font-size: 1.7rem;
          font-weight: 900;
          margin-bottom: 28px;
          position: relative;
        }

        .contact-item {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 16px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px;
          transition: background 0.2s;
        }

        .contact-item:hover { background: rgba(255,255,255,0.13); }

        .contact-icon {
          width: 38px; height: 38px;
          background: rgba(249,115,22,0.2);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fdba74;
          flex-shrink: 0;
        }

        .contact-label {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(255,255,255,0.5);
          margin-bottom: 3px;
        }

        .contact-value {
          font-size: 0.9rem;
          color: rgba(255,255,255,0.9);
          font-weight: 500;
        }

        /* Vision Card */
        .vision-card {
          background: white;
          border-radius: 30px;
          padding: 36px;
          border: 1px solid rgba(26,60,179,0.07);
          box-shadow: 0 4px 24px rgba(11,31,95,0.06);
        }

        .vision-card h2 {
          font-family: 'Playfair Display', serif;
          font-size: 1.7rem;
          font-weight: 900;
          color: var(--navy);
          text-align: center;
          margin-bottom: 28px;
        }

        .vm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

        .vm-box {
          border-radius: 22px;
          padding: 24px;
        }

        .vm-box.blue-box {
          background: #f0f4ff;
          border: 1px solid #d0dcff;
        }

        .vm-box.orange-box {
          background: #fff8f2;
          border: 1px solid #ffe0c8;
        }

        .vm-icon {
          width: 50px; height: 50px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          margin-bottom: 14px;
        }

        .blue-box .vm-icon { background: #dce6ff; }
        .orange-box .vm-icon { background: #ffdfc5; }

        .vm-title {
          font-family: 'Playfair Display', serif;
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--navy);
          margin-bottom: 10px;
        }

        .vm-text {
          font-size: 0.88rem;
          color: var(--muted);
          line-height: 1.7;
        }

        /* Enquiry Form */
        .enquiry-card {
          background: white;
          border-radius: 30px;
          padding: 32px;
          border: 1px solid rgba(26,60,179,0.07);
          box-shadow: 0 4px 24px rgba(11,31,95,0.06);
        }

        .enquiry-card h2 {
          font-family: 'Playfair Display', serif;
          font-size: 1.7rem;
          font-weight: 900;
          color: var(--navy);
          margin-bottom: 6px;
        }

        .enquiry-subtitle {
          font-size: 0.85rem;
          color: var(--muted);
          margin-bottom: 24px;
        }

        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .form-group { display: flex; flex-direction: column; gap: 4px; }

        .form-select-wrap { position: relative; }

        .form-select-wrap::after {
          content: '';
          position: absolute;
          right: 14px; top: 50%;
          transform: translateY(-50%);
          width: 0; height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 6px solid #9ca3af;
          pointer-events: none;
        }

        .success-toast {
          background: linear-gradient(135deg, #059669, #10b981);
          color: white;
          border-radius: 14px;
          padding: 14px 18px;
          font-size: 0.9rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
          animation: slideDown 0.3s ease;
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Footer */
        .footer {
          background: var(--navy);
          color: rgba(255,255,255,0.6);
          text-align: center;
          padding: 32px 2rem;
          font-size: 0.85rem;
        }

        .footer-brand {
          font-family: 'Playfair Display', serif;
          font-size: 1.3rem;
          font-weight: 900;
          color: white;
          margin-bottom: 8px;
        }

        /* Scroll top */
        .scroll-top {
          position: fixed;
          bottom: 28px; right: 28px;
          z-index: 99;
          width: 48px; height: 48px;
          background: linear-gradient(135deg, var(--navy), var(--blue-light));
          color: white;
          border: none;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 6px 24px rgba(11,31,95,0.3);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .scroll-top:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 32px rgba(11,31,95,0.4);
        }

        /* Responsive */
        @media (max-width: 1024px) {
          .hero-inner { grid-template-columns: 1fr; }
          .hero-card { display: none; }
          .stats-inner { grid-template-columns: repeat(2, 1fr); gap: 1rem; }
          .stat-item:nth-child(2)::after { display: none; }
          .bottom-grid { grid-template-columns: 1fr; }
          .carousel-slide { grid-template-columns: 1fr; padding: 40px; }
          .carousel-img { display: none; }
        }

        @media (max-width: 768px) {
          .nav-links { display: none; }
          .why-grid { grid-template-columns: 1fr; }
          .vm-grid { grid-template-columns: 1fr; }
          .form-row { grid-template-columns: 1fr; }
          .stats-inner { grid-template-columns: repeat(2, 1fr); }
          .hero { padding: 60px 1.5rem 70px; min-height: auto; }
        }

        @media (max-width: 480px) {
          .stats-inner { grid-template-columns: 1fr 1fr; gap: 0.5rem; }
          .stat-item { padding: 0 16px; }
          .stat-item:nth-child(1)::after, .stat-item:nth-child(3)::after { display: none; }
        }
      `}</style>

      <div className="min-h-screen overflow-x-hidden">

        {/* NAVBAR */}
        <nav className="navbar">
          <div className="nav-inner">
            <div className="nav-logo">
              <div className="logo-icon">
                <Atom className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="logo-text">Intellekt</div>
                <div className="logo-sub">Academy</div>
              </div>
            </div>
            <ul className="nav-links">
              <li><a href="#about">About</a></li>
              <li><a href="#why">Why Us</a></li>
              <li><a href="#contact">Contact</a></li>
              <li>
                <a
                  href="#enquiry"
                  className="nav-cta"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection(enquiryRef);
                  }}
                >
                  Enroll Now
                </a>
              </li>
            </ul>
          </div>
        </nav>

        {/* HERO */}
        <section className="hero">
          <div className="hero-grid" />
          <div className="hero-blob" />
          <div className="hero-inner">
            <div>
              <div className="hero-badge">
                <div className="hero-badge-dot" />
                Premium Coaching Center · Coimbatore
              </div>
              <h1 className="hero-title">
                Excel in <span>Maths</span>
                <br />& <span>Physics</span>
                <br />with Intellekt
              </h1>
              <p className="hero-desc">
                Concept-driven coaching for higher secondary students across all major boards.
                Build strong foundations for engineering and science careers.
              </p>
              <div className="hero-actions">
                <button
                  className="btn-primary"
                  onClick={() => scrollToSection(enquiryRef)}
                >
                  Start Your Journey →
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => scrollToSection(contactRef)}
                >
                  Contact Us
                </button>
              </div>
            </div>
            <div className="hero-card">
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.1rem', fontWeight: 700, marginBottom: 6, color: 'white' }}>
                What We Teach
              </div>
              <div style={{ fontSize: '0.83rem', color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
                Higher Secondary Science Stream
              </div>
              <div className="hero-subjects">
                <div className="subject-pill">
                  <div className="icon">∑</div>
                  <div className="name">Mathematics</div>
                  <div className="tag">11th & 12th</div>
                </div>
                <div className="subject-pill">
                  <div className="icon">⚛</div>
                  <div className="name">Physics</div>
                  <div className="tag">11th & 12th</div>
                </div>
                <div className="subject-pill">
                  <div className="icon">📐</div>
                  <div className="name">All Boards</div>
                  <div className="tag">CBSE · State · ICSE</div>
                </div>
                <div className="subject-pill">
                  <div className="icon">🎯</div>
                  <div className="name">Competitive</div>
                  <div className="tag">JEE · NEET Prep</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STATS STRIP */}
        <div className="stats-strip">
          <div className="stats-inner">
            {stats.map((s, i) => (
              <div className="stat-item" key={i}>
                <div className="stat-icon">{s.icon}</div>
                <div>
                  <div className="stat-value">{s.value}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CAROUSEL */}
        <div id="about" className="carousel-section">
          <div className={`carousel-wrap ${animating ? "fade" : ""}`}>
            <div className="carousel-slide">
              <div>
                <div className="carousel-badge">{cards[currentCard].badge}</div>
                <h2 className="carousel-title">{cards[currentCard].title}</h2>
                <p className="carousel-desc">{cards[currentCard].description}</p>
              </div>
              <div className="carousel-img">
                <Image
                  src={cards[currentCard].image}
                  alt={cards[currentCard].alt}
                  width={480}
                  height={360}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            </div>
          </div>
          <div className="carousel-controls">
            <button className="carousel-btn" onClick={goPrev}>
              <ChevronLeft className="w-5 h-5" />
            </button>
            {cards.map((_, i) => (
              <button
                key={i}
                className={`carousel-dot${currentCard === i ? " active" : ""}`}
                onClick={() => setCurrentCard(i)}
              />
            ))}
            <button className="carousel-btn" onClick={goNext}>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* WHY INTELLEKT */}
        <div id="why" className="why-section">
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <div className="section-header">
              <div className="section-tag">
                <Star className="w-3.5 h-3.5" />
                Our Approach
              </div>
              <h2 className="section-title">Why Intellekt Works</h2>
              <p className="section-subtitle">
                We go beyond textbooks — building thinkers, problem-solvers, and future leaders in STEM.
              </p>
            </div>
            <div className="why-grid">
              <div className="why-card">
                <div className="why-icon pink">📘</div>
                <div className="why-title">Personalized Learning</div>
                <p className="why-text">
                  Students learn at their own pace with concept-focused teaching, strengthening
                  fundamentals and building confidence in Mathematics and Physics.
                </p>
              </div>
              <div className="why-card">
                <div className="why-icon orange">🚀</div>
                <div className="why-title">Future-Focused Guidance</div>
                <p className="why-text">
                  We prepare students for higher education and competitive academic environments
                  through analytical thinking, mentoring, and strategic preparation.
                </p>
              </div>
              <div className="why-card">
                <div className="why-icon blue">🔬</div>
                <div className="why-title">Concept Clarity First</div>
                <p className="why-text">
                  Every lesson is built around deep conceptual understanding, not rote learning —
                  giving students the tools to tackle any exam with confidence.
                </p>
              </div>
              <div className="why-card">
                <div className="why-icon green">🌱</div>
                <div className="why-title">Holistic Mentoring</div>
                <p className="why-text">
                  We nurture not just academic skills but also growth mindset, discipline, and
                  critical thinking to shape well-rounded future professionals.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CONTACT + VISION + ENQUIRY */}
        <section id="contact" className="bottom-section">
          <div className="bottom-grid">

            {/* CONTACT */}
            <div ref={contactRef} className="contact-card">
              <h2>Contact Us</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="contact-item">
                  <div className="contact-icon">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="contact-label">Email</div>
                    <div className="contact-value">support@intellekt.com</div>
                  </div>
                </div>
                <div className="contact-item">
                  <div className="contact-icon">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="contact-label">Phone</div>
                    <div className="contact-value">+91 98765 43210</div>
                  </div>
                </div>
                <div className="contact-item">
                  <div className="contact-icon">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="contact-label">Location</div>
                    <a
                      href="https://maps.app.goo.gl/B4JhSmtsjJsx9ixT9"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#fdba74', fontSize: '0.9rem', fontWeight: 500, textDecoration: 'underline' }}
                    >
                      View on Google Maps ↗
                    </a>
                  </div>
                </div>
              </div>

              <div style={{
                marginTop: 28,
                padding: '18px',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.1)',
              }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)', marginBottom: 8, fontWeight: 700 }}>
                  Office Hours
                </div>
                <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.7 }}>
                  Mon – Sat: 8:00 AM – 8:00 PM<br />
                  Sunday: By Appointment
                </div>
              </div>
            </div>

            {/* VISION & MISSION */}
            <div className="vision-card">
              <h2>Vision & Mission</h2>
              <div className="vm-grid">
                <div className="vm-box blue-box">
                  <div className="vm-icon">🎯</div>
                  <div className="vm-title">Vision</div>
                  <p className="vm-text">
                    To create a generation of INTELLEKTUALS who lead with logic,
                    creativity, and academic excellence.
                  </p>
                </div>
                <div className="vm-box orange-box">
                  <div className="vm-icon">🌟</div>
                  <div className="vm-title">Mission</div>
                  <p className="vm-text">
                    To inspire students to achieve their highest potential in
                    Mathematics and Physics through innovative teaching,
                    strategic guidance, and personal mentoring.
                  </p>
                </div>
              </div>

              {/* Boards Supported */}
              <div style={{ marginTop: 24, padding: '20px', background: '#f8faff', borderRadius: 18, border: '1px solid #e8eeff' }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280', fontWeight: 700, marginBottom: 12 }}>
                  Boards Supported
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {['CBSE', 'State Board', 'ICSE', 'Matric'].map((b) => (
                    <span key={b} style={{
                      background: '#e8eeff',
                      color: '#1a3cb3',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      padding: '5px 14px',
                      borderRadius: 100,
                    }}>{b}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* ENQUIRY FORM */}
            <div id="enquiry" ref={enquiryRef} className="enquiry-card">
              <h2>Enquiry</h2>
              <p className="enquiry-subtitle">Fill in the details below and we'll reach out shortly.</p>

              {formSuccess && (
                <div className="success-toast">
                  ✓ Enquiry submitted successfully! We'll contact you soon.
                </div>
              )}

              <form onSubmit={handleEnquirySubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label className={labelClass}>Student Name</label>
                  <input
                    type="text"
                    name="studentName"
                    value={formData.studentName}
                    onChange={handleChange}
                    placeholder="Full name"
                    className={inputClass}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className={labelClass}>Class</label>
                    <div className="form-select-wrap">
                      <select name="className" value={formData.className} onChange={handleChange} className={selectClass} required>
                        <option value="">Select</option>
                        <option value="11">Class 11</option>
                        <option value="12">Class 12</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className={labelClass}>Board</label>
                    <div className="form-select-wrap">
                      <select name="board" value={formData.board} onChange={handleChange} className={selectClass} required>
                        <option value="">Select</option>
                        <option value="CBSE">CBSE</option>
                        <option value="State">State Board</option>
                        <option value="ICSE">ICSE</option>
                        <option value="Matric">Matric</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className={labelClass}>School Name</label>
                  <input
                    type="text"
                    name="schoolName"
                    value={formData.schoolName}
                    onChange={handleChange}
                    placeholder="Name of school"
                    className={inputClass}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className={labelClass}>Subject</label>
                  <div className="form-select-wrap">
                    <select name="subjects" value={formData.subjects} onChange={handleChange} className={selectClass} required>
                      <option value="">Select subject</option>
                      <option value="Mathematics">Mathematics</option>
                      <option value="Physics">Physics</option>
                      <option value="Both">Mathematics & Physics</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className={labelClass}>Year From</label>
                    <input
                      type="text"
                      name="academicYearFrom"
                      value={formData.academicYearFrom}
                      onChange={handleChange}
                      placeholder="2024"
                      className={inputClass}
                      maxLength={4}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className={labelClass}>Year To</label>
                    <input
                      type="text"
                      name="academicYearTo"
                      value={formData.academicYearTo}
                      onChange={handleChange}
                      placeholder="2025"
                      className={inputClass}
                      maxLength={4}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className={labelClass}>Mode of Education</label>
                  <div className="form-select-wrap">
                    <select name="modeOfEducation" value={formData.modeOfEducation} onChange={handleChange} className={selectClass} required>
                      <option value="">Select mode</option>
                      <option value="Online">Online</option>
                      <option value="Offline">Offline</option>
                      <option value="Hybrid">Hybrid</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className={labelClass}>Parent / Guardian Name</label>
                  <input
                    type="text"
                    name="parentName"
                    value={formData.parentName}
                    onChange={handleChange}
                    placeholder="Parent full name"
                    className={inputClass}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className={labelClass}>Mobile Number</label>
                    <input
                      type="tel"
                      name="mobileNumber"
                      value={formData.mobileNumber}
                      onChange={handleChange}
                      placeholder="10-digit number"
                      className={inputClass}
                      maxLength={10}
                      required
                    />
                    {phoneError && <span style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 2 }}>{phoneError}</span>}
                  </div>
                  <div className="form-group">
                    <label className={labelClass}>Secondary Contact</label>
                    <input
                      type="tel"
                      name="secondaryContact"
                      value={formData.secondaryContact}
                      onChange={handleChange}
                      placeholder="Alternate number"
                      className={inputClass}
                      maxLength={10}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className={labelClass}>Area / Location</label>
                  <input
                    type="text"
                    name="area"
                    value={formData.area}
                    onChange={handleChange}
                    placeholder="Your locality or area"
                    className={inputClass}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className={labelClass}>Reference (Optional)</label>
                  <input
                    type="text"
                    name="reference"
                    value={formData.reference}
                    onChange={handleChange}
                    placeholder="How did you hear about us?"
                    className={inputClass}
                  />
                </div>

                <button
                  type="submit"
                  disabled={formSubmitting}
                  style={{
                    width: '100%',
                    padding: '0.85rem',
                    background: formSubmitting
                      ? '#9ca3af'
                      : 'linear-gradient(135deg, #0b1f5f, #3a5fd9)',
                    color: 'white',
                    borderRadius: 14,
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    border: 'none',
                    cursor: formSubmitting ? 'not-allowed' : 'pointer',
                    boxShadow: formSubmitting ? 'none' : '0 6px 20px rgba(11,31,95,0.25)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    marginTop: 4,
                    letterSpacing: '0.02em',
                  }}
                  onMouseEnter={(e) => {
                    if (!formSubmitting) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 10px 28px rgba(11,31,95,0.35)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(11,31,95,0.25)';
                  }}
                >
                  {formSubmitting ? "Submitting..." : "Submit Enquiry →"}
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="footer">
          <div className="footer-brand">Intellekt Academy</div>
          <p>Premium Coaching for Mathematics & Physics · Coimbatore, Tamil Nadu</p>
          <p style={{ marginTop: 6 }}>© {new Date().getFullYear()} Intellekt Academy. All rights reserved.</p>
        </footer>

        {showScrollTop && (
          <button className="scroll-top" onClick={scrollToTop} aria-label="Scroll to top">
            <ArrowUp className="w-5 h-5" />
          </button>
        )}
      </div>
    </>
  );
}
