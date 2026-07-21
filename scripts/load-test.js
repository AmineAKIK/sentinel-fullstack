// Scénario de charge minimal pour Sentinel (k6 : https://k6.io/docs/get-started/installation/).
//
// Usage :
//   k6 run --env BASE_URL=http://127.0.0.1:3000 scripts/load-test.js
//
// Dimensionnement : GLOBAL_API_RATE_LIMIT_MAX=3000 sur une fenêtre de 15 min
// (backend/.env.example) autorise ~3,3 req/s par IP en régime nominal. Ce
// scénario reste sous ce seuil pour mesurer la latence en conditions
// normales, pas pour vérifier le rate limiting lui-même.
//
// Manuel, non intégré à la CI : un test de charge suppose une instance
// dédiée (pas la base de test partagée des autres suites) et des durées
// incompatibles avec un pipeline qui doit rester rapide.

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';

export const options = {
  scenarios: {
    steady_state: {
      executor: 'constant-arrival-rate',
      rate: 2,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 10,
      maxVUs: 30,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300', 'p(99)<800'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/health`);
  check(res, {
    'status 200': (r) => r.status === 200,
    'db ok': (r) => {
      try {
        return JSON.parse(r.body).db === 'ok';
      } catch {
        return false;
      }
    },
  });
  sleep(0.1);
}
