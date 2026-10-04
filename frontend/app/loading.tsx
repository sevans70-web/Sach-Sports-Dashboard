export default function Loading() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, rgba(120,82,12,.08), #050706 240px)",
        color: "#fff",
      }}
      aria-label="Loading Sach Sports"
    >
      <div
        style={{
          maxWidth: 780,
          margin: "0 auto",
          padding: "14px 16px",
        }}
      >
        <div
          style={{
            borderBottom:
              "1px solid rgba(229,187,69,.28)",
            paddingBottom: 10,
            color: "#e5bb45",
            fontWeight: 900,
            letterSpacing: ".04em",
          }}
        >
          SACH <span style={{ color: "#fff" }}>SPORTS</span>
        </div>
      </div>
    </main>
  );
}
