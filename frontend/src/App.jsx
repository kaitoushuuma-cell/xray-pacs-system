import Practice from './Practice'
import { useState, useEffect, useCallback } from 'react'

const API_BASE = 'http://localhost:8000'

function App() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [gender, setGender] = useState('M')
  const [message, setMessage] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [dicomFile, setDicomFile] = useState(null)
  const [dicomMessage, setDicomMessage] = useState('')
  const [uploadResult, setUploadResult] = useState(null)
  const [studies, setStudies] = useState([])
  const [selectedStudy, setSelectedStudy] = useState(null)
  const [aiResult, setAiResult] = useState(null)
  const [aiFile, setAiFile] = useState(null)
  const [aiFilePreview, setAiFilePreview] = useState(null)
  const [showReportForm, setShowReportForm] = useState(false)
  const [findings, setFindings] = useState('')
  const [conclusion, setConclusion] = useState('')
  const [radiologist, setRadiologist] = useState('')
  const [reportMessage, setReportMessage] = useState('')
  const [reports, setReports] = useState([])
  const [statusFilter, setStatusFilter] = useState('全て')
  const [expandedPatientId, setExpandedPatientId] = useState(null)
  const [patientHistoryCache, setPatientHistoryCache] = useState({})
  const [aiGenerating, setAiGenerating] = useState(false)
  const fetchPatients = async () => {
    const res = await fetch(`${API_BASE}/patients`)
    const data = await res.json()
    setPatients(data)
    setLoading(false)
  }

  useEffect(() => {
  fetchPatients()
  fetchStudies()
  fetchReports()
  }, [])

  const fetchStudies = async () => {
  const res = await fetch(`${API_BASE}/studies`)
  const data = await res.json()
  setStudies(data)
  }

  const fetchReports = async () => {
    const res = await fetch(`${API_BASE}/reports`)
    const data = await res.json()
    setReports(data)
  }

  const handleCreateReport = async () => {
    const params = new URLSearchParams({
      study_id: selectedStudy.study_id,
      patient_name: selectedStudy.patient_name,
      modality: selectedStudy.modality,
      study_date: selectedStudy.study_date,
      ai_result: aiResult.result,
      ai_confidence: aiResult.confidence,
      findings,
      conclusion,
      radiologist
    })
    const res = await fetch(`${API_BASE}/reports?${params}`, { method: 'POST' })
    if (res.ok) {
      setReportMessage('レポートを作成しました！')
      setShowReportForm(false)
      await updateStatus(selectedStudy.study_id, 'レポート済')
      fetchReports()
    }
  }

  const updateStatus = async (study_id, status) => {
    await fetch(`${API_BASE}/studies/${study_id}/status?status=${encodeURIComponent(status)}`, { method: 'PATCH' })
    fetchStudies()
  }

  const handleSubmit = async () => {
      if (!name || !birthdate) {
        setMessage('名前と生年月日を入力してください')
        return
      }
      const patient_id = 'P' + Date.now()
      const url = `${API_BASE}/patients?patient_id=${patient_id}&name=${encodeURIComponent(name)}&birth_date=${birthdate}&gender=${gender}`
      const res = await fetch(url, { method: 'POST' })
      if (res.ok) {
        setMessage('登録しました！')
        setName('')
        setBirthdate('')
        setGender('M')
        fetchPatients()
      } else {
        setMessage('登録に失敗しました')
      }
  }

  const handleDicomUpload = async () => {
    if (!selectedPatientId || !dicomFile) {
      setDicomMessage('患者と画像ファイルを選択してください')
      return
    }
    const formData = new FormData()
    formData.append('file', dicomFile)
    const url = `${API_BASE}/dicom/upload?patient_id=${selectedPatientId}`
    const res = await fetch(url, { method: 'POST', body: formData })
    if (res.ok) {
      const data = await res.json()
      setUploadResult(data)
      setDicomMessage('アップロード成功！')
    } else {
      setDicomMessage('アップロードに失敗しました')
    }
  }

    const handlePredict = async () => {
        if (!aiFile) {
          alert('画像ファイルを選択してください')
          return
        }
        const formData = new FormData()
        formData.append('file', aiFile)
        const res = await fetch(
            `${API_BASE}/predict?study_id=${selectedStudy.study_id}`,
            { method: 'POST', body: formData }
        )
        const data = await res.json()
        setAiResult(data)
        fetchStudies()
    }

  const setAiFileWithPreview = (file) => {
    setAiFile(file)
    if (file) setAiFilePreview(URL.createObjectURL(file))
  }

  const handlePaste = useCallback((e) => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
    if (item) {
      const file = item.getAsFile()
      setAiFileWithPreview(file)
    }
  }, [])

  const fetchPatientHistory = async (patientId) => {
    if (patientHistoryCache[patientId]) return
    const res = await fetch(`${API_BASE}/patients/${patientId}`)
    const data = await res.json()
    setPatientHistoryCache(prev => ({ ...prev, [patientId]: data.studies }))
  }

  const togglePatientHistory = async (patientId) => {
    if (expandedPatientId === patientId) {
      setExpandedPatientId(null)
    } else {
      setExpandedPatientId(patientId)
      await fetchPatientHistory(patientId)
    }
  }

  const selectStudyFromHistory = (study, ai_result, ai_confidence) => {
    setSelectedStudy(study)
    if (ai_result) {
      setAiResult({ result: ai_result, confidence: ai_confidence })
    } else {
      setAiResult(null)
    }
    setShowReportForm(false)
    setReportMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const generateAiText = async () => {
    if (!selectedStudy) return
    setAiGenerating(true)
    try {
      const res = await fetch(`${API_BASE}/generate-report-text?study_id=${selectedStudy.study_id}`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setFindings(data.findings)
        setConclusion(data.conclusion)
      } else {
        const err = await res.json()
        alert(`AI生成エラー: ${err.detail}`)
      }
    } finally {
      setAiGenerating(false)
    }
  }


  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto' }}>
      <h1>🏥 XRAY PACS System</h1>

      {/* 患者登録 */}
      <div style={{ background: '#f0f4ff', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem' }}>
        <h2>患者登録</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxWidth: '400px' }}>
          <input placeholder="患者名" value={name} onChange={e => setName(e.target.value)} style={{ padding: '0.5rem', fontSize: '1rem' }} />
          <input type="date" value={birthdate} onChange={e => setBirthdate(e.target.value)} style={{ padding: '0.5rem', fontSize: '1rem' }} />
          <select value={gender} onChange={e => setGender(e.target.value)} style={{ padding: '0.5rem', fontSize: '1rem' }}>
            <option value="M">男性</option>
            <option value="F">女性</option>
          </select>
          <button onClick={handleSubmit} style={{ padding: '0.7rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', fontSize: '1rem', cursor: 'pointer' }}>
            登録する
          </button>
          {message && <p style={{ color: '#16a34a' }}>{message}</p>}
        </div>
      </div>

      {/* 検査一覧 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '2rem' }}>
        <h2 style={{ margin: 0 }}>検査一覧</h2>
        {['全て', '未読', '既読', 'AI診断済', 'レポート済'].map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            style={{ padding: '0.3rem 0.8rem', borderRadius: '4px', border: 'none', cursor: 'pointer',
              background: statusFilter === f ? '#3b82f6' : '#e2e8f0',
              color: statusFilter === f ? 'white' : '#333', fontWeight: statusFilter === f ? 'bold' : 'normal' }}>
            {f}
          </button>
        ))}
      </div>
      {studies.length === 0 ? <p>検査データがありません</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem', marginTop: '0.8rem' }}>
          <thead>
            <tr style={{ background: '#e2e8f0' }}>
              <th style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>患者名</th>
              <th style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>モダリティ</th>
              <th style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>撮影日</th>
              <th style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>ステータス</th>
              <th style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>画像</th>
            </tr>
          </thead>
          <tbody>
            {studies.filter(s => statusFilter === '全て' || s.status === statusFilter).map(s => (
              <tr key={s.study_id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>{s.patient_name}</td>
                <td style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>{s.modality}</td>
                <td style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>{s.study_date}</td>
                <td style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>
                  {{
                    '未読':     <span style={{ color: '#dc2626', fontWeight: 'bold' }}>未読</span>,
                    '既読':     <span style={{ color: '#2563eb', fontWeight: 'bold' }}>既読</span>,
                    'AI診断済': <span style={{ color: '#d97706', fontWeight: 'bold' }}>AI診断済</span>,
                    'レポート済': <span style={{ color: '#16a34a', fontWeight: 'bold' }}>レポート済</span>,
                  }[s.status] ?? <span>{s.status}</span>}
                  {s.status === '未読' && (
                    <button onClick={() => updateStatus(s.study_id, '既読')}
                      style={{ marginLeft: '0.5rem', padding: '0.1rem 0.5rem', fontSize: '0.75rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                      既読
                    </button>
                  )}
                </td>
                <td style={{ padding: '0.7rem', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                  {s.jpeg_file && (
                    <img
                      src={`${API_BASE}/images/${s.jpeg_file}`}
                      alt="サムネイル"
                      style={{ width: '60px', height: '60px', objectFit: 'cover', display: 'block', margin: '0 auto 0.3rem' }}
                    />
                  )}
                  <button
                    onClick={() => setSelectedStudy(s)}
                    style={{ padding: '0.3rem 0.7rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    表示
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 画像表示エリア */}
      {selectedStudy && (
        <div style={{ background: '#1e1e1e', padding: '1.5rem', borderRadius: '8px', marginTop: '1rem' }}>
          <h3 style={{ color: 'white' }}>🖼 {selectedStudy.patient_name} - {selectedStudy.modality}</h3>
          <p style={{ color: '#aaa' }}>撮影日: {selectedStudy.study_date}</p>
          <p style={{ color: '#aaa' }}>ステータス: {selectedStudy.status}</p>
          {selectedStudy.jpeg_file ? (
            <img
              src={`http://localhost:8000/images/${selectedStudy.jpeg_file}`}
              alt="DICOM画像"
              style={{ marginTop: '1rem', width: '100%', maxWidth: '400px', border: '2px solid #444' }}
            />
          ) : (
            <p style={{ color: '#f87171', marginTop: '1rem' }}>この検査には画像がありません</p>
          )}

          <div
            onPaste={handlePaste}
            tabIndex={0}
            style={{ marginTop: '1rem', border: '2px dashed #555', borderRadius: '8px', padding: '1rem', color: '#aaa', textAlign: 'center', cursor: 'text', outline: 'none' }}
          >
            {aiFilePreview ? (
              <img src={aiFilePreview} alt="ペースト画像" style={{ maxWidth: '300px', maxHeight: '200px', objectFit: 'contain' }} />
            ) : (
              <p style={{ margin: 0 }}>ここをクリックして Ctrl+V で画像を貼り付け</p>
            )}
          </div>
          <input
                type="file"
                accept="image/*,.dcm"
                onChange={e => setAiFileWithPreview(e.target.files[0])}
                style={{ marginTop: '0.5rem', color: 'white' }}
            />
            <button
                onClick={handlePredict}
                style={{ marginTop: '0.5rem', padding: '0.7rem 1.5rem', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
            >
                🤖 AI診断を実行
            </button>
          {aiResult && (
              <div style={{ marginTop: '1rem', background: '#2d2d2d', padding: '1rem', borderRadius: '8px' }}>
                  <p style={{ color: aiResult.result === '正常' ? '#4ade80' : '#f87171', fontSize: '1.2rem', fontWeight: 'bold' }}>
                      診断結果：{aiResult.result}
                  </p>
                  <p style={{ color: '#aaa' }}>確信度：{aiResult.confidence}</p>
              </div>
          )}
          {aiResult && (
            <button
              onClick={() => setShowReportForm(true)}
              style={{ marginTop: '0.5rem', marginLeft: '0.5rem', padding: '0.7rem 1.5rem', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
            >
              📝 レポートを作成
            </button>
          )}
          {showReportForm && aiResult && (
            <div style={{ marginTop: '1rem', background: '#2d2d2d', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <h4 style={{ color: 'white', margin: 0 }}>📝 読影レポート作成</h4>
                <button
                  onClick={generateAiText}
                  disabled={aiGenerating}
                  style={{ padding: '0.5rem 1rem', background: aiGenerating ? '#555' : '#7c3aed', color: 'white', border: 'none', borderRadius: '4px', cursor: aiGenerating ? 'not-allowed' : 'pointer', fontSize: '0.9rem' }}
                >
                  {aiGenerating ? '生成中...' : '✨ AI所見を自動生成'}
                </button>
              </div>
              <p style={{ color: '#aaa', fontSize: '0.9rem' }}>AI診断結果：{aiResult.result}（{aiResult.confidence}）</p>
              <textarea
                placeholder="所見を入力してください"
                value={findings}
                onChange={e => setFindings(e.target.value)}
                style={{ width: '100%', height: '80px', marginTop: '0.5rem', padding: '0.5rem', borderRadius: '4px', background: '#1e1e1e', color: 'white', border: '1px solid #444', boxSizing: 'border-box' }}
              />
              <textarea
                placeholder="結論を入力してください"
                value={conclusion}
                onChange={e => setConclusion(e.target.value)}
                style={{ width: '100%', height: '60px', marginTop: '0.5rem', padding: '0.5rem', borderRadius: '4px', background: '#1e1e1e', color: 'white', border: '1px solid #444', boxSizing: 'border-box' }}
              />
              <input
                placeholder="読影医名"
                value={radiologist}
                onChange={e => setRadiologist(e.target.value)}
                style={{ width: '100%', marginTop: '0.5rem', padding: '0.5rem', borderRadius: '4px', background: '#1e1e1e', color: 'white', border: '1px solid #444', boxSizing: 'border-box' }}
              />
              <button
                onClick={handleCreateReport}
                style={{ marginTop: '0.5rem', padding: '0.7rem 1.5rem', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                保存する
              </button>
              {reportMessage && <p style={{ color: '#4ade80', marginTop: '0.5rem' }}>{reportMessage}</p>}
            </div>
          )}
        </div>
      )}

      {/* DICOMアップロード */}
      <div style={{ background: '#f0fff4', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem' }}>
        <h2>🖼 DICOMアップロード</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxWidth: '400px' }}>
          <select value={selectedPatientId} onChange={e => setSelectedPatientId(e.target.value)} style={{ padding: '0.5rem', fontSize: '1rem' }}>
            <option value="">患者を選択</option>
            {patients.map(p => (
              <option key={p.patient_id} value={p.patient_id}>{p.name}（{p.patient_id}）</option>
            ))}
          </select>
          <input type="file" accept=".dcm" onChange={e => setDicomFile(e.target.files[0])} style={{ padding: '0.5rem' }} />
          <button onClick={handleDicomUpload} style={{ padding: '0.7rem', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', fontSize: '1rem', cursor: 'pointer' }}>
            アップロード
          </button>
          {dicomMessage && <p style={{ color: '#16a34a' }}>{dicomMessage}</p>}
         {uploadResult && (
      <div style={{ background: 'white', padding: '1rem', borderRadius: '4px', fontSize: '0.9rem' }}>
        <p>📋 モダリティ: {uploadResult.modality}</p>
        <p>📅 撮影日: {uploadResult.study_date}</p>
        <p>🖼 サイズ: {uploadResult.image_size}</p>
        {uploadResult.jpeg_file && (
          <div style={{ marginTop: '1rem' }}>
            <p>📸 変換画像：</p>
            <img
              src={`http://localhost:8000/images/${uploadResult.jpeg_file}`}
              alt="DICOM変換画像"
              style={{ width: '100%', maxWidth: '300px', border: '1px solid #ccc' }}
            />
          </div>
        )}
      </div>
    )}
        </div>
      </div>

      {/* 患者一覧 */}
      <h2>患者一覧</h2>
      {loading ? <p>読み込み中...</p> : patients.length === 0 ? <p>患者データがありません</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#e2e8f0' }}>
              <th style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>ID</th>
              <th style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>患者名</th>
              <th style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>生年月日</th>
              <th style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>性別</th>
              <th style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>過去画像</th>
            </tr>
          </thead>
          <tbody>
            {patients.map(p => (
              <>
                <tr key={p.id}>
                  <td style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>{p.id}</td>
                  <td style={{ padding: '0.7rem', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>{p.name}</td>
                  <td style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>{p.birth_date}</td>
                  <td style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>{p.gender === 'M' ? '男性' : '女性'}</td>
                  <td style={{ padding: '0.7rem', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                    <button
                      onClick={() => togglePatientHistory(p.patient_id)}
                      style={{ padding: '0.3rem 0.7rem', background: expandedPatientId === p.patient_id ? '#64748b' : '#0ea5e9', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                      {expandedPatientId === p.patient_id ? '閉じる' : '過去画像を見る'}
                    </button>
                  </td>
                </tr>
                {expandedPatientId === p.patient_id && (
                  <tr key={`history-${p.id}`}>
                    <td colSpan={5} style={{ background: '#f8fafc', padding: '1rem', border: '1px solid #cbd5e1' }}>
                      <p style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#334155' }}>
                        {p.name} の検査履歴
                      </p>
                      {!patientHistoryCache[p.patient_id] ? (
                        <p style={{ color: '#888' }}>読み込み中...</p>
                      ) : patientHistoryCache[p.patient_id].length === 0 ? (
                        <p style={{ color: '#888' }}>検査履歴がありません</p>
                      ) : (
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                          {patientHistoryCache[p.patient_id].map(s => (
                            <div key={s.study_id} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.8rem', minWidth: '160px', textAlign: 'center' }}>
                              {s.jpeg_file ? (
                                <img
                                  src={`${API_BASE}/images/${s.jpeg_file}`}
                                  alt="検査画像"
                                  style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '4px', display: 'block', margin: '0 auto' }}
                                />
                              ) : (
                                <div style={{ width: '120px', height: '120px', background: '#e2e8f0', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', color: '#888', fontSize: '0.75rem' }}>
                                  画像なし
                                </div>
                              )}
                              <p style={{ fontSize: '0.8rem', margin: '0.4rem 0 0.1rem', color: '#475569' }}>{s.study_date}</p>
                              <p style={{ fontSize: '0.8rem', margin: '0.1rem 0', color: '#475569' }}>{s.modality}</p>
                              {s.ai_result && (
                                <p style={{ fontSize: '0.75rem', margin: '0.1rem 0', color: s.ai_result === '正常' ? '#16a34a' : '#dc2626', fontWeight: 'bold' }}>
                                  {s.ai_result}（{s.ai_confidence}）
                                </p>
                              )}
                              <span style={{ display: 'inline-block', fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', marginTop: '0.2rem',
                                background: s.status === 'レポート済' ? '#dcfce7' : s.status === 'AI診断済' ? '#fef3c7' : s.status === '既読' ? '#dbeafe' : '#fee2e2',
                                color: s.status === 'レポート済' ? '#16a34a' : s.status === 'AI診断済' ? '#d97706' : s.status === '既読' ? '#2563eb' : '#dc2626'
                              }}>{s.status}</span>
                              <br />
                              <button
                                onClick={() => selectStudyFromHistory(s, s.ai_result, s.ai_confidence)}
                                style={{ marginTop: '0.5rem', padding: '0.3rem 0.7rem', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                              >
                                選択してレポート
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
      {/* レポート一覧 */}
      <h2 style={{ marginTop: '2rem' }}>📋 レポート一覧</h2>
      {reports.length === 0 ? <p>レポートがありません</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#e2e8f0' }}>
              <th style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>患者名</th>
              <th style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>モダリティ</th>
              <th style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>AI診断</th>
              <th style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>所見</th>
              <th style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>結論</th>
              <th style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>読影医</th>
              <th style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>作成日時</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id}>
                <td style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>{r.patient_name}</td>
                <td style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>{r.modality}</td>
                <td style={{ padding: '0.7rem', border: '1px solid #cbd5e1', color: r.ai_result === '正常' ? '#16a34a' : '#dc2626', fontWeight: 'bold' }}>{r.ai_result}（{r.ai_confidence}）</td>
                <td style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>{r.findings}</td>
                <td style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>{r.conclusion}</td>
                <td style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>{r.radiologist}</td>
                <td style={{ padding: '0.7rem', border: '1px solid #cbd5e1' }}>{r.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Practice />
    </div>
  )
}

export default App