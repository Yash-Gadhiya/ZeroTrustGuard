function calculateRisk({ sensitivity, anomalyScore, frequency, context }) {
  const risk =
    sensitivity * 0.3 +
    anomalyScore * 0.4 +
    frequency * 0.2 +
    context * 0.1;

  return Math.round(risk);
}

function riskDecision(riskScore) {
  if (riskScore < 30) {
    return "ALLOW";
  } else if (riskScore < 70) {
    return "MFA_REQUIRED";
  } else {
    return "BLOCK";
  }
}

module.exports = { calculateRisk, riskDecision };