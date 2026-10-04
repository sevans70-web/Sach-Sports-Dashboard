export default function Loading() {
  return (
    <main
      style={{
        maxWidth: 780,
        margin: "0 auto",
        padding: "12px 14px 72px",
        color: "#fff",
        background: "#050706",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          height: 48,
          borderRadius: 12,
          border: "1px solid rgba(229,187,69,.34)",
          background:
            "linear-gradient(90deg, rgba(229,187,69,.08), rgba(255,255,255,.025), rgba(229,187,69,.08))",
        }}
      />
      <div
        style={{
          height: 180,
          marginTop: 12,
          borderRadius: 18,
          border: "1px solid rgba(229,187,69,.34)",
          background:
            "linear-gradient(110deg, rgba(229,187,69,.13), #0c0f0e 52%, rgba(229,187,69,.04))",
        }}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 8,
          marginTop: 14,
        }}
      >
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            style={{
              height: 72,
              borderRadius: 13,
              border: "1px solid #303431",
              background: "#101311",
            }}
          />
        ))}
      </div>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          style={{
            height: 136,
            marginTop: 12,
            borderRadius: 16,
            border: "1px solid #303431",
            background: "#101311",
          }}
        />
      ))}
    </main>
  );
}
