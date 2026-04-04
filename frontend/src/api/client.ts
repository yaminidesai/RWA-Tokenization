import axios from 'axios'

// withCredentials=true sends the httpOnly token cookie on every request.
// The token is never accessible to JavaScript — it lives only in the cookie.
export const api = axios.create({ baseURL: '/api', timeout: 30_000, withCredentials: true })

// Redirect to login on 401 and clear any stale session data
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

// ── Typed API calls ───────────────────────────────────────────────────────────

export const authApi = {
  register: (body: { email: string; password: string; fullName: string; jurisdiction: string }) =>
    api.post('/auth/register', body),
  login: (body: { email: string; password: string }) => api.post('/auth/login', body),
  logout: () => api.post('/auth/logout', {}),
}

export const bondsApi = {
  list: () => api.get('/bonds'),
  get: (id: string) => api.get(`/bonds/${id}`),
}

export const investorApi = {
  kyc: () => api.get('/investor/kyc'),
  holdings: () => api.get('/investor/holdings'),
  purchases: () => api.get('/investor/purchases'),
  coupons: () => api.get('/investor/coupons'),
  redemptions: () => api.get('/investor/redemptions'),
  submitPurchase: (body: object) => api.post('/investor/purchases', body),
  transfer: (holdingId: string, body: object) =>
    api.post(`/investor/holdings/${holdingId}/transfer`, body),
  splitTransfer: (holdingId: string, body: object) =>
    api.post(`/investor/holdings/${holdingId}/split-transfer`, body),
  redeem: (holdingId: string) => api.post(`/investor/holdings/${holdingId}/redeem`, {}),
}

export const adminApi = {
  stats: () => api.get('/admin/stats'),
  pendingKyc: () => api.get('/admin/kyc/pending'),
  approveKyc: (investorId: string) => api.post(`/admin/kyc/${investorId}/approve`, {}),
  rejectKyc: (investorId: string, reason: string) =>
    api.post(`/admin/kyc/${investorId}/reject`, { reason }),
  bonds: () => api.get('/admin/bonds'),
  createBond: (body: object) => api.post('/admin/bonds', body),
  pendingPurchases: () => api.get('/admin/purchases/pending'),
  approvePurchase: (id: string) => api.post(`/admin/purchases/${id}/approve`, {}),
  rejectPurchase: (id: string, reason: string) =>
    api.post(`/admin/purchases/${id}/reject`, { reason }),
  pendingRedemptions: () => api.get('/admin/redemptions/pending'),
  approveRedemption: (id: string, investorAccountRef: string) =>
    api.post(`/admin/redemptions/${id}/approve`, { investorAccountRef }),
  distributeCoupon: (body: object) => api.post('/admin/coupons/distribute', body),
  investors: () => api.get('/admin/investors'),
}
