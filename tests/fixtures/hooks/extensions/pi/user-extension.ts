// A Pi extension the user wrote, with no agn marker on its first line.
export default function (pi) {
  pi.on("agent_start", () => {
    console.log("mine");
  });
}
