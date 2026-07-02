import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import jsPDF from 'jspdf'


const API_BASE = 'http://localhost:8000'

const fmtDate = (d) => d ? String(d).slice(0, 10) : '-'

const STEP_COLORS = {
  1: { bg: '#eff6ff', border: '#3b82f6', badge: '#3b82f6' },
  2: { bg: '#f0fdf4', border: '#16a34a', badge: '#16a34a' },
  3: { bg: '#faf5ff', border: '#7c3aed', badge: '#7c3aed' },
  4: { bg: '#f0fdf4', border: '#059669', badge: '#059669' },
}

function StepHeader({ step, title }) {
  const c = STEP_COLORS[step]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem' }}>
      <span style={{
        background: c.badge, color: 'white', borderRadius: '50%',
        width: '1.9rem', height: '1.9rem', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontWeight: 'bold', fontSize: '1rem', flexShrink: 0
      }}>{step}</span>
      <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{title}</h2>
    </div>
  )
}

function App() {
  const [patients, setPatients]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [name, setName]                   = useState('')
  const [birthdate, setBirthdate]         = useState('')
  const [gender, setGender]               = useState('M')
  const [message, setMessage]             = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState('')
  // アップロードモード
  const [uploadMode, setUploadMode]       = useState('simple') // 'simple' | 'dicom'
  const [simpleFile, setSimpleFile]       = useState(null)
  const [simpleModality, setSimpleModality] = useState('CR')
  const [simpleMessage, setSimpleMessage] = useState('')
  const [simpleResult, setSimpleResult]   = useState(null)
  const [dicomFile, setDicomFile]         = useState(null)
  const [dicomMessage, setDicomMessage]   = useState('')
  const [uploadResult, setUploadResult]   = useState(null)
  // 検査・AI診断
  const [studies, setStudies]             = useState([])
  const [aiResult, setAiResult]           = useState(null)
  const [findings, setFindings]           = useState('')
  const [conclusion, setConclusion]       = useState('')
  const [radiologist, setRadiologist]     = useState('')
  const [reportMessage, setReportMessage] = useState('')
  const [reports, setReports]             = useState([])
  const [statusFilter, setStatusFilter]   = useState('全て')
  // 患者履歴
  const [expandedPatientId, setExpandedPatientId] = useState(null)
  const [patientHistoryCache, setPatientHistoryCache] = useState({})
  // UI状態
  const [aiGenerating, setAiGenerating]   = useState(false)
  const [zoomedImage, setZoomedImage]     = useState(null)
  const [inlineStudyId, setInlineStudyId] = useState(null)
  const [inlineMode, setInlineMode]       = useState(null) // 'ai' | 'report'
  const [inlineStudy, setInlineStudy]     = useState(null)
  const [timeline, setTimeline] = useState(null)
  const [selectedPatientForTimeline, setSelectedPatientForTimeline] = useState(null)
  const [lifelogs, setLifelogs] = useState([])
  const [lifelogForm, setLifelogForm] = useState({
      record_date: '', steps: '', sleep_hours: '', meal: '普通', weight: '', memo: ''
  })
  const [lifelogMessage, setLifelogMessage] = useState('')
  const [showLifelogForm, setShowLifelogForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [groupComparison, setGroupComparison] = useState(false)
  const [riskScore, setRiskScore] = useState(null)


  useEffect(() => {
    fetchPatients(); fetchStudies(); fetchReports()
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setZoomedImage(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const fetchPatients = async () => {
    const res = await fetch(`${API_BASE}/patients`)
    setPatients(await res.json())
    setLoading(false)
  }
  const fetchStudies = async () => {
    const res = await fetch(`${API_BASE}/studies`)
    setStudies(await res.json())
  }
  const fetchReports = async () => {
    const res = await fetch(`${API_BASE}/reports`)
    setReports(await res.json())
  }
  const fetchTimeline = async (patient_id) => {
      const res = await fetch(`${API_BASE}/patients/${patient_id}/timeline`)
      const data = await res.json()
      setTimeline(data)
      fetchLifelogs(patient_id)
      // リスクスコアも取得
      const riskRes = await fetch(`${API_BASE}/patients/${patient_id}/risk-score`)
      const riskData = await riskRes.json()
      setRiskScore(riskData)
  }
    // 異常傾向を検出する関数
  const detectAlert = (studies) => {
      const diagnosed = studies.filter(s => s.ai_result)
      for (let i = 1; i < diagnosed.length; i++) {
          if (diagnosed[i - 1].ai_result === '正常' && diagnosed[i].ai_result === '肺炎') {
              return {
                  detected: true,
                  from: diagnosed[i - 1].study_date?.split('T')[0],
                  to: diagnosed[i].study_date?.split('T')[0],
              }
          }
      }
      return { detected: false }
  }
  const fetchLifelogs = async (patient_id) => {
    const res = await fetch(`${API_BASE}/patients/${patient_id}/lifelogs`)
    const data = await res.json()
    setLifelogs(data)
  }

  const handleCreateLifelog = async (patient_id) => {
      const params = new URLSearchParams({
          record_date: lifelogForm.record_date,
          steps: lifelogForm.steps,
          sleep_hours: lifelogForm.sleep_hours,
          meal: lifelogForm.meal,
          weight: lifelogForm.weight,
          memo: lifelogForm.memo
      })
      const res = await fetch(`${API_BASE}/patients/${patient_id}/lifelogs?${params}`, {
          method: 'POST'
      })
      if (res.ok) {
          setLifelogMessage('記録しました！')
          fetchLifelogs(patient_id)
          setShowLifelogForm(false)
      }
  }

  const toggleCancerFlag = async (patient_id, currentFlag) => {
    const newFlag = currentFlag ? 0 : 1
    await fetch(`${API_BASE}/patients/${patient_id}/cancer-flag?flag=${newFlag}`, { method: 'PATCH' })
    fetchPatients()
}

const toggleRemissionMode = async (patient_id, currentMode) => {
    const newMode = currentMode ? 0 : 1
    await fetch(`${API_BASE}/patients/${patient_id}/remission?mode=${newMode}`, { method: 'PATCH' })
    fetchPatients()
}

  // ── 患者登録 ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!name || !birthdate) { setMessage('名前と生年月日を入力してください'); return }
    const patient_id = 'P' + Date.now()
    const url = `${API_BASE}/patients?patient_id=${patient_id}&name=${encodeURIComponent(name)}&birth_date=${birthdate}&gender=${gender}`
    const res = await fetch(url, { method: 'POST' })
    if (res.ok) {
      setMessage('登録しました！'); setName(''); setBirthdate(''); setGender('M')
      fetchPatients()
    } else { setMessage('登録に失敗しました') }
  }

  // ── 患者削除 ───────────────────────────────────────────────────
  const handleDeletePatient = async (patient_id) => {
    if (!window.confirm('この患者と関連する検査データをすべて削除しますか？')) return
    const res = await fetch(`${API_BASE}/patients/${patient_id}`, { method: 'DELETE' })
    if (res.ok) {
      fetchPatients(); fetchStudies(); setPatientHistoryCache({})
    }
  }

  // ── レポート削除 ───────────────────────────────────────────────
  const handleDeleteReport = async (report_id) => {
    if (!window.confirm('このレポートを削除しますか？')) return
    const res = await fetch(`${API_BASE}/reports/${report_id}`, { method: 'DELETE' })
    if (res.ok) fetchReports()
  }

  const handleExportPDF = (r) => {
      const doc = new jsPDF()
      doc.setFont('helvetica')
      
      // タイトル
      doc.setFontSize(18)
      doc.text('Radiology Report', 20, 20)
      
      // 区切り線
      doc.setLineWidth(0.5)
      doc.line(20, 25, 190, 25)
      
      // 患者情報
      doc.setFontSize(12)
      doc.text(`Patient: ${r.patient_name}`, 20, 35)
      doc.text(`Study Date: ${r.study_date}`, 20, 55)
      doc.text(`Created: ${r.created_at}`, 20, 65)

      // モダリティ（日本語を英語に変換）
      const modalityMap = { '不明': 'Unknown' }
      const modalityEn = modalityMap[r.modality] || r.modality
      doc.text(`Modality: ${modalityEn}`, 20, 45)
      
      // AI診断（英語に変換）
      const aiResultEn = r.ai_result === '正常' ? 'Normal' 
          : r.ai_result === '肺炎' ? 'Pneumonia' 
          : r.ai_result === '未実施' ? 'Not performed'
          : r.ai_result
      
      // 区切り線
      doc.line(20, 87, 190, 87)
      
      // 所見（英語のみ）
      doc.setFontSize(11)
      doc.text('Findings:', 20, 97)
      const findingsText = r.findings ? r.findings.replace(/[^\x00-\x7F]/g, '?') : '-'
      const findings = doc.splitTextToSize(findingsText, 170)
      doc.text(findings, 20, 107)
      
      // 結論
      doc.text('Conclusion:', 20, 130)
      const conclusionText = r.conclusion ? r.conclusion.replace(/[^\x00-\x7F]/g, '?') : '-'
      const conclusion = doc.splitTextToSize(conclusionText, 170)
      doc.text(conclusion, 20, 140)
      
      // 読影医
      doc.line(20, 160, 190, 160)
      const radiologistText = r.radiologist ? r.radiologist.replace(/[^\x00-\x7F]/g, '?') : '-'
      doc.text(`Radiologist: ${radiologistText}`, 20, 170)
      
      // 保存
      doc.save(`report_${r.patient_name}_${r.study_date}.pdf`)
  }

  // ── 一般画像アップロード ───────────────────────────────────────
  const handleSimpleUpload = async () => {
    if (!selectedPatientId || !simpleFile) { setSimpleMessage('患者とファイルを選択してください'); return }
    const formData = new FormData()
    formData.append('file', simpleFile)
    const res = await fetch(`${API_BASE}/simple-upload?patient_id=${selectedPatientId}&modality=${simpleModality}`, { method: 'POST', body: formData })
    if (res.ok) {
      const data = await res.json()
      setSimpleResult(data); setSimpleMessage('アップロード成功！'); fetchStudies()
    } else { setSimpleMessage('アップロードに失敗しました') }
  }

  // ── DICOMアップロード ──────────────────────────────────────────
  const handleDicomUpload = async () => {
    if (!selectedPatientId || !dicomFile) { setDicomMessage('患者とファイルを選択してください'); return }
    const formData = new FormData()
    formData.append('file', dicomFile)
    const res = await fetch(`${API_BASE}/dicom/upload?patient_id=${selectedPatientId}`, { method: 'POST', body: formData })
    if (res.ok) {
      const data = await res.json()
      setUploadResult(data); setDicomMessage('アップロード成功！'); fetchStudies()
    } else { setDicomMessage('アップロードに失敗しました') }
  }

  // ── インライン展開 ──────────────────────────────────────────────
  const openInline = (study, mode) => {
    if (inlineStudyId === study.study_id && inlineMode === mode) {
      setInlineStudyId(null); setInlineMode(null); setInlineStudy(null); return
    }
    setInlineStudy(study); setInlineStudyId(study.study_id); setInlineMode(mode)
    setAiResult(null)
    setFindings(''); setConclusion(''); setRadiologist(''); setReportMessage('')
  }

  // ── AI診断（登録済み画像を使用） ──────────────────────────────
  const handlePredict = async () => {
    const res = await fetch(`${API_BASE}/studies/${inlineStudy.study_id}/predict-registered`, { method: 'POST' })
    if (!res.ok) {
      const err = await res.json()
      alert(err.detail)
      return
    }
    setAiResult(await res.json())
    fetchStudies()
  }

  // ── レポート作成 ───────────────────────────────────────────────
  const handleCreateReport = async () => {
    const study = inlineStudy
    const params = new URLSearchParams({
      study_id:      study.study_id,
      patient_name:  study.patient_name,
      modality:      study.modality,
      study_date:    fmtDate(study.study_date),
      ai_result:     aiResult?.result     || study.ai_result     || '未実施',
      ai_confidence: aiResult?.confidence || study.ai_confidence || '-',
      findings, conclusion, radiologist
    })
    const res = await fetch(`${API_BASE}/reports?${params}`, { method: 'POST' })
    if (res.ok) {
      setReportMessage('レポートを保存しました！')
      await fetch(`${API_BASE}/studies/${study.study_id}/status?status=${encodeURIComponent('レポート済')}`, { method: 'PATCH' })
      fetchStudies(); fetchReports()
    }
  }

  const generateAiText = async () => {
    if (!inlineStudy) return
    setAiGenerating(true)
    try {
      const res = await fetch(`${API_BASE}/generate-report-text?study_id=${inlineStudy.study_id}`, { method: 'POST' })
      if (res.ok) { const d = await res.json(); setFindings(d.findings); setConclusion(d.conclusion) }
      else { const err = await res.json(); alert(`AI生成エラー: ${err.detail}`) }
    } finally { setAiGenerating(false) }
  }

  // ── 患者履歴 ───────────────────────────────────────────────────
  const fetchPatientHistory = async (patientId) => {
    if (patientHistoryCache[patientId]) return
    const res = await fetch(`${API_BASE}/patients/${patientId}`)
    const data = await res.json()
    setPatientHistoryCache(prev => ({ ...prev, [patientId]: data.studies }))
  }
  const togglePatientHistory = async (patientId) => {
    if (expandedPatientId === patientId) { setExpandedPatientId(null); return }
    setExpandedPatientId(patientId); await fetchPatientHistory(patientId)
  }
  const selectStudyFromHistory = (study) => {
    openInline(study, 'report')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const updateStatus = async (study_id, status) => {
    await fetch(`${API_BASE}/studies/${study_id}/status?status=${encodeURIComponent(status)}`, { method: 'PATCH' })
    fetchStudies()
  }

  const statusBadge = (status) => ({
    '未読':      <span style={{ color: '#dc2626', fontWeight: 'bold' }}>未読</span>,
    '既読':      <span style={{ color: '#2563eb', fontWeight: 'bold' }}>既読</span>,
    'AI診断済':  <span style={{ color: '#d97706', fontWeight: 'bold' }}>AI診断済</span>,
    'レポート済': <span style={{ color: '#16a34a', fontWeight: 'bold' }}>レポート済</span>,
  }[status] ?? <span>{status}</span>)

  // ── インライン: AI診断パネル ────────────────────────────────────
  const AiPanel = ({ s }) => (
    <td colSpan={5} style={{ padding: '1.2rem', background: '#12152a', borderBottom: '2px solid #7c3aed' }}>
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* 登録済み画像 */}
        <div>
          <p style={{ color: '#94a3b8', fontSize: '0.78rem', margin: '0 0 0.4rem' }}>診断対象画像（クリックで拡大）</p>
          {s.jpeg_file ? (
            <img src={`${API_BASE}/images/${s.jpeg_file}`} alt="診断対象"
              style={{ width: '220px', maxWidth: '100%', border: '2px solid #7c3aed', borderRadius: '4px', cursor: 'zoom-in', display: 'block' }}
              onClick={() => setZoomedImage(`${API_BASE}/images/${s.jpeg_file}`)} />
          ) : (
            <div style={{ width: '220px', height: '160px', background: '#2d2d2d', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', fontSize: '0.82rem' }}>
              ⚠️ 画像が登録されていません
            </div>
          )}
        </div>

        {/* 診断実行 */}
        <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '0.8rem', justifyContent: 'center' }}>
          <div style={{ background: '#1e2235', padding: '0.8rem', borderRadius: '6px' }}>
            <p style={{ color: '#a5b4fc', fontSize: '0.82rem', margin: '0 0 0.4rem' }}>患者：{s.patient_name}</p>
            <p style={{ color: '#a5b4fc', fontSize: '0.82rem', margin: '0 0 0.4rem' }}>モダリティ：{s.modality}</p>
            <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: 0 }}>
              ※ AI診断は胸部単純X線（CR）専用モデルです
            </p>
          </div>

          <button onClick={handlePredict} disabled={!s.jpeg_file}
            style={{ padding: '0.8rem 1.5rem', background: s.jpeg_file ? '#7c3aed' : '#374151', color: 'white', border: 'none', borderRadius: '6px', cursor: s.jpeg_file ? 'pointer' : 'not-allowed', fontSize: '1rem', fontWeight: 'bold' }}>
            🤖 AI診断を実行
          </button>

          {aiResult && (
            <div style={{ background: '#1e2235', padding: '1rem', borderRadius: '6px', borderLeft: `4px solid ${aiResult.result === '正常' ? '#4ade80' : '#f87171'}` }}>
              <p style={{ color: aiResult.result === '正常' ? '#4ade80' : '#f87171', fontSize: '1.2rem', fontWeight: 'bold', margin: '0 0 0.2rem' }}>
                {aiResult.result === '正常' ? '✅' : '⚠️'} 診断結果：{aiResult.result}
              </p>
              <p style={{ color: '#94a3b8', margin: '0 0 0.8rem', fontSize: '0.88rem' }}>確信度：{aiResult.confidence}</p>
              <button onClick={() => setInlineMode('report')}
                style={{ padding: '0.5rem 1.2rem', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}>
                📝 レポート作成へ →
              </button>
            </div>
          )}
        </div>
      </div>
    </td>
  )

  // ── インライン: レポートフォーム ────────────────────────────────
  const ReportPanel = ({ s }) => {
    const existingAi = aiResult || (s.ai_result ? { result: s.ai_result, confidence: s.ai_confidence } : null)
    return (
      <td colSpan={5} style={{ padding: '1.2rem', background: '#0f1f18', borderBottom: '2px solid #059669' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.8rem' }}>
          <h4 style={{ color: 'white', margin: 0 }}>📝 {s.patient_name}（{s.modality}）のレポート作成</h4>
          <button onClick={generateAiText} disabled={aiGenerating}
            style={{ padding: '0.4rem 1rem', background: aiGenerating ? '#555' : '#7c3aed', color: 'white', border: 'none', borderRadius: '4px', cursor: aiGenerating ? 'not-allowed' : 'pointer', fontSize: '0.82rem' }}>
            {aiGenerating ? '生成中...' : '✨ AI所見を自動生成'}
          </button>
        </div>
        {existingAi ? (
          <p style={{ color: '#6ee7b7', fontSize: '0.85rem', margin: '0 0 0.8rem' }}>
            AI診断：<strong>{existingAi.result}</strong>（{existingAi.confidence}）
          </p>
        ) : (
          <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: '0 0 0.8rem' }}>
            ※ AI診断未実施。所見と結論を直接入力してください。
          </p>
        )}
        <label style={{ color: '#94a3b8', fontSize: '0.78rem' }}>所見</label>
        <textarea placeholder="所見を入力してください" value={findings} onChange={e => setFindings(e.target.value)}
          style={{ width: '100%', height: '80px', marginTop: '0.3rem', padding: '0.5rem', borderRadius: '4px', background: '#111827', color: 'white', border: '1px solid #374151', boxSizing: 'border-box', resize: 'vertical', fontSize: '0.88rem', display: 'block' }} />
        <label style={{ color: '#94a3b8', fontSize: '0.78rem', display: 'block', marginTop: '0.6rem' }}>結論</label>
        <textarea placeholder="結論を入力してください" value={conclusion} onChange={e => setConclusion(e.target.value)}
          style={{ width: '100%', height: '60px', marginTop: '0.3rem', padding: '0.5rem', borderRadius: '4px', background: '#111827', color: 'white', border: '1px solid #374151', boxSizing: 'border-box', resize: 'vertical', fontSize: '0.88rem', display: 'block' }} />
        <label style={{ color: '#94a3b8', fontSize: '0.78rem', display: 'block', marginTop: '0.6rem' }}>読影医名</label>
        <input placeholder="例：山田 太郎" value={radiologist} onChange={e => setRadiologist(e.target.value)}
          style={{ width: '100%', marginTop: '0.3rem', padding: '0.5rem', borderRadius: '4px', background: '#111827', color: 'white', border: '1px solid #374151', boxSizing: 'border-box', fontSize: '0.88rem' }} />
        <div style={{ display: 'flex', gap: '0.8rem', marginTop: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleCreateReport}
            style={{ padding: '0.6rem 1.8rem', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.95rem' }}>
            レポートを保存する
          </button>
          {reportMessage && <span style={{ color: '#4ade80', fontSize: '0.88rem' }}>{reportMessage}</span>}
        </div>
      </td>
    )
  }

  // ── JSX ────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '980px', margin: '0 auto' }}>

    {/* ヘッダー */}
    <div style={{ marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '3px solid #3b82f6' }}>
      <h1 style={{ margin: 0, fontSize: '1.8rem' }}>🏥 XRAY PACS System</h1>
      <p style={{ color: '#64748b', margin: '0.4rem 0 0', fontSize: '0.95rem' }}>
        患者登録 → 画像アップロード → AI診断 → レポート作成　の一気通貫ワークフロー
      </p>
      {/* ここだけ追加 */}
      <p style={{ color: '#3b82f6', marginTop: '0.5rem' }}>
        患者 {patients.length}名 ／ 検査 {studies.length}件 ／ レポート {reports.length}件
      </p>
    </div>

    {/* ── ダッシュボード ── */}
    {(() => {
        const diagnosed = studies.filter(s => s.ai_result)
        const normal = diagnosed.filter(s => s.ai_result === '正常').length
        const pneumonia = diagnosed.filter(s => s.ai_result === '肺炎').length
        const undiagnosed = studies.length - diagnosed.length
        const pieData = [
            { name: '正常', value: normal, color: '#16a34a' },
            { name: '肺炎', value: pneumonia, color: '#dc2626' },
            { name: '未診断', value: undiagnosed, color: '#94a3b8' },
        ].filter(d => d.value > 0)
        return (
            <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem', border: '1px solid #e2e8f0' }}>
                <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', color: '#475569' }}>📊 AI診断ダッシュボード</h2>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* 統計カード */}
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ background: '#dcfce7', padding: '1rem 1.5rem', borderRadius: '8px', textAlign: 'center', minWidth: '100px' }}>
                            <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#16a34a' }}>{normal}</p>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#166534' }}>✅ 正常</p>
                        </div>
                        <div style={{ background: '#fee2e2', padding: '1rem 1.5rem', borderRadius: '8px', textAlign: 'center', minWidth: '100px' }}>
                            <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#dc2626' }}>{pneumonia}</p>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#991b1b' }}>⚠️ 肺炎</p>
                        </div>
                        <div style={{ background: '#f1f5f9', padding: '1rem 1.5rem', borderRadius: '8px', textAlign: 'center', minWidth: '100px' }}>
                            <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#64748b' }}>{undiagnosed}</p>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>🔲 未診断</p>
                        </div>
                        {pneumonia > 0 && (
                            <div style={{ background: '#fef3c7', padding: '1rem 1.5rem', borderRadius: '8px', textAlign: 'center', minWidth: '100px' }}>
                                <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#d97706' }}>
                                    {Math.round(pneumonia / diagnosed.length * 100)}%
                                </p>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#92400e' }}>📈 肺炎率</p>
                            </div>
                        )}
                    </div>
                    {/* 円グラフ */}
                    {pieData.length > 0 && (
                        <PieChart width={160} height={160}>
                            <Pie data={pieData} cx={75} cy={75} innerRadius={40} outerRadius={70} dataKey="value">
                                {pieData.map((entry, index) => (
                                    <Cell key={index} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value, name) => [value + '件', name]} />
                        </PieChart>
                    )}
                </div>
            </div>
        )
      })()}

      {/* 月別推移グラフ */}
      {(() => {
          const monthlyData = {}
          studies.filter(s => s.ai_result).forEach(s => {
              const month = s.study_date?.split('T')[0]?.slice(0, 7) || '不明'
              if (!monthlyData[month]) monthlyData[month] = { month, 正常: 0, 肺炎: 0 }
              monthlyData[month][s.ai_result]++
          })
          const chartData = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month))
          return chartData.length > 0 ? (
              <div style={{ marginTop: '1rem' }}>
                  <p style={{ fontWeight: 'bold', color: '#475569', margin: '0 0 0.5rem', fontSize: '0.88rem' }}>📈 月別AI診断推移</p>
                  <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="正常" stroke="#16a34a" name="正常" dot={true} strokeWidth={2} />
                          <Line type="monotone" dataKey="肺炎" stroke="#dc2626" name="肺炎" dot={true} strokeWidth={2} />
                      </LineChart>
                  </ResponsiveContainer>
              </div>
          ) : null
      })()}

      {/* 患者登録数推移グラフ */}
      {(() => {
          const monthlyPatients = {}
          patients.forEach(p => {
              const month = p.created_at?.slice(0, 7) || '不明'
              if (!monthlyPatients[month]) monthlyPatients[month] = { month, 登録数: 0 }
              monthlyPatients[month].登録数++
          })
          const chartData = Object.values(monthlyPatients).sort((a, b) => a.month.localeCompare(b.month))
          return chartData.length > 0 ? (
              <div style={{ marginTop: '1rem' }}>
                  <p style={{ fontWeight: 'bold', color: '#475569', margin: '0 0 0.5rem', fontSize: '0.88rem' }}>👥 月別患者登録数</p>
                  <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                          <Tooltip />
                          <Line type="monotone" dataKey="登録数" stroke="#3b82f6" name="登録数" dot={true} strokeWidth={2} />
                      </LineChart>
                  </ResponsiveContainer>
              </div>
          ) : null
      })()}

      {/* がんあり/なし 生活習慣比較 */}
      {(() => {
          const cancerPatients = patients.filter(p => p.cancer_flag === 1)
          const healthyPatients = patients.filter(p => p.cancer_flag === 0)
          return (
              <div style={{ marginTop: '1.5rem', background: '#fdf2f8', padding: '1rem', borderRadius: '8px', border: '1px solid #fbcfe8' }}>
                  <p style={{ fontWeight: 'bold', color: '#9d174d', margin: '0 0 0.5rem', fontSize: '0.88rem' }}>
                      🔬 がんあり/なし患者グループ
                  </p>
                  <p style={{ color: '#64748b', fontSize: '0.82rem', margin: '0 0 0.8rem' }}>
                      🔴 がんあり：{cancerPatients.length}名　／　⚪ がんなし：{healthyPatients.length}名
                  </p>
                  <button
                      onClick={() => setGroupComparison(!groupComparison)}
                      style={{ padding: '0.5rem 1rem', background: '#be185d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
                      {groupComparison ? '比較を閉じる' : '📊 生活習慣を比較する'}
                  </button>
              </div>
          )
      })()}
      
        {groupComparison && (
            <div style={{ marginTop: '1rem', background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #fbcfe8' }}>
                <p style={{ fontWeight: 'bold', color: '#9d174d', margin: '0 0 1rem', fontSize: '0.9rem' }}>
                    📊 グループ別生活習慣比較（平均値）
                </p>
                {(() => {
                    const cancerIds = patients.filter(p => p.cancer_flag === 1).map(p => p.patient_id)
                    const healthyIds = patients.filter(p => p.cancer_flag === 0).map(p => p.patient_id)
                    // ※ 現在lifelogsは選択中患者のみ。全患者分は別途APIが必要。
                    // まずはグループ人数と「データ収集中」の表示を出す
                    return (
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, background: '#fee2e2', padding: '1rem', borderRadius: '8px', minWidth: '200px' }}>
                                <p style={{ fontWeight: 'bold', color: '#dc2626', margin: '0 0 0.5rem' }}>🔴 がんあり（{cancerIds.length}名）</p>
                                <p style={{ color: '#64748b', fontSize: '0.82rem', margin: 0 }}>
                                    対象患者：{patients.filter(p => p.cancer_flag === 1).map(p => p.name).join('、') || 'なし'}
                                </p>
                            </div>
                            <div style={{ flex: 1, background: '#f0fdf4', padding: '1rem', borderRadius: '8px', minWidth: '200px' }}>
                                <p style={{ fontWeight: 'bold', color: '#16a34a', margin: '0 0 0.5rem' }}>⚪ がんなし（{healthyIds.length}名）</p>
                                <p style={{ color: '#64748b', fontSize: '0.82rem', margin: 0 }}>
                                    対象患者：{patients.filter(p => p.cancer_flag === 0).map(p => p.name).join('、') || 'なし'}
                                </p>
                            </div>
                        </div>
                    )
                })()}
            </div>
          )}

      {/* ライトボックス */}
      {zoomedImage && (
        <div onClick={() => setZoomedImage(null)}
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, cursor: 'zoom-out' }}>
          <button onClick={() => setZoomedImage(null)}
            style={{ position: 'absolute', top: '1.2rem', right: '1.5rem', background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: '1.4rem', width: '2.4rem', height: '2.4rem', borderRadius: '50%', cursor: 'pointer' }}>✕</button>
          <img src={zoomedImage} alt="拡大" onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '4px', boxShadow: '0 0 40px rgba(0,0,0,0.6)' }} />
        </div>
      )}

      {/* ── STEP 1: 患者登録 ── */}
      <div style={{ background: STEP_COLORS[1].bg, padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem', borderLeft: `4px solid ${STEP_COLORS[1].border}` }}>
        <StepHeader step={1} title="患者登録" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxWidth: '400px' }}>
          <input placeholder="患者名" value={name} onChange={e => setName(e.target.value)}
            style={{ padding: '0.5rem', fontSize: '1rem', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
          <input type="date" value={birthdate} onChange={e => setBirthdate(e.target.value)}
            style={{ padding: '0.5rem', fontSize: '1rem', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
          <select value={gender} onChange={e => setGender(e.target.value)}
            style={{ padding: '0.5rem', fontSize: '1rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
            <option value="M">男性</option>
            <option value="F">女性</option>
          </select>
          <button onClick={handleSubmit}
            style={{ padding: '0.7rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', fontSize: '1rem', cursor: 'pointer' }}>
            登録する
          </button>
          {message && <p style={{ color: '#16a34a', margin: 0 }}>{message}</p>}
        </div>
      </div>

      {/* ── STEP 2: 画像アップロード ── */}
      <div style={{ background: STEP_COLORS[2].bg, padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem', borderLeft: `4px solid ${STEP_COLORS[2].border}` }}>
        <StepHeader step={2} title="🖼 画像・検査アップロード" />

        {/* モード切替 */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.2rem' }}>
          {[['simple', '📷 一般画像（PNG/JPEG）'], ['dicom', '🏥 DICOMファイル']].map(([mode, label]) => (
            <button key={mode} onClick={() => setUploadMode(mode)}
              style={{ padding: '0.4rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.88rem',
                background: uploadMode === mode ? '#16a34a' : '#e2e8f0',
                color: uploadMode === mode ? 'white' : '#333', fontWeight: uploadMode === mode ? 'bold' : 'normal' }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxWidth: '420px' }}>
          {/* 共通: 患者選択 */}
          <select value={selectedPatientId} onChange={e => setSelectedPatientId(e.target.value)}
            style={{ padding: '0.5rem', fontSize: '1rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
            <option value="">患者を選択してください</option>
            {patients
              .filter(p => p.name && p.name.includes(searchQuery))
              .map(p => (
              <option key={p.patient_id} value={p.patient_id}>{p.name}（{p.patient_id}）</option>
            ))}
          </select>

          {/* 一般画像モード */}
          {uploadMode === 'simple' && (
            <>
              <select value={simpleModality} onChange={e => setSimpleModality(e.target.value)}
                style={{ padding: '0.5rem', fontSize: '1rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                <option value="CR">CR（単純X線）</option>
                <option value="CT">CT</option>
                <option value="MRI">MRI</option>
                <option value="US">US（超音波）</option>
                <option value="NM">NM（核医学）</option>
              </select>
              <input type="file" accept="image/*" onChange={e => setSimpleFile(e.target.files[0])}
                style={{ padding: '0.3rem' }} />
              <button onClick={handleSimpleUpload}
                style={{ padding: '0.7rem', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', fontSize: '1rem', cursor: 'pointer' }}>
                アップロード
              </button>
              {simpleMessage && <p style={{ color: '#16a34a', margin: 0 }}>{simpleMessage}</p>}
              {simpleResult && (
                <div style={{ background: 'white', padding: '0.8rem', borderRadius: '6px', fontSize: '0.88rem', border: '1px solid #d1fae5' }}>
                  <p style={{ margin: '0 0 0.3rem' }}>✅ {simpleResult.modality} 検査を登録しました</p>
                  {simpleResult.jpeg_file && (
                    <img src={`${API_BASE}/images/${simpleResult.jpeg_file}`} alt="プレビュー"
                      style={{ width: '100%', maxWidth: '260px', borderRadius: '4px', cursor: 'zoom-in', display: 'block', marginTop: '0.5rem', border: '1px solid #ccc' }}
                      onClick={() => setZoomedImage(`${API_BASE}/images/${simpleResult.jpeg_file}`)} />
                  )}
                </div>
              )}
            </>
          )}

          {/* DICOMモード */}
          {uploadMode === 'dicom' && (
            <>
              <input type="file" accept=".dcm" onChange={e => setDicomFile(e.target.files[0])}
                style={{ padding: '0.3rem' }} />
              <button onClick={handleDicomUpload}
                style={{ padding: '0.7rem', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', fontSize: '1rem', cursor: 'pointer' }}>
                アップロード
              </button>
              {dicomMessage && <p style={{ color: '#16a34a', margin: 0 }}>{dicomMessage}</p>}
              {uploadResult && (
                <div style={{ background: 'white', padding: '0.8rem', borderRadius: '6px', fontSize: '0.88rem', border: '1px solid #d1fae5' }}>
                  <p style={{ margin: '0 0 0.2rem' }}>📋 モダリティ: {uploadResult.modality}</p>
                  <p style={{ margin: '0 0 0.2rem' }}>📅 撮影日: {uploadResult.study_date}</p>
                  <p style={{ margin: '0 0 0.4rem' }}>🖼 サイズ: {uploadResult.image_size}</p>
                  {uploadResult.jpeg_file && (
                    <img src={`${API_BASE}/images/${uploadResult.jpeg_file}`} alt="プレビュー"
                      style={{ width: '100%', maxWidth: '260px', borderRadius: '4px', cursor: 'zoom-in', display: 'block', border: '1px solid #ccc' }}
                      onClick={() => setZoomedImage(`${API_BASE}/images/${uploadResult.jpeg_file}`)} />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── STEP 3: 検査一覧・AI診断・レポート ── */}
      <div style={{ marginBottom: '2rem', borderLeft: `4px solid ${STEP_COLORS[3].border}`, paddingLeft: '1rem' }}>
        <StepHeader step={3} title="🤖 検査一覧・AI診断・レポート作成" />

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', color: '#64748b' }}>ステータス：</span>
          {['全て', '未読', '既読', 'AI診断済', 'レポート済'].map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              style={{ padding: '0.2rem 0.7rem', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '0.82rem',
                background: statusFilter === f ? '#7c3aed' : '#e2e8f0',
                color: statusFilter === f ? 'white' : '#333', fontWeight: statusFilter === f ? 'bold' : 'normal' }}>
              {f}
            </button>
          ))}
        </div>

        {studies.length === 0 ? (
          <p style={{ color: '#94a3b8' }}>検査データがありません。STEP 2 で画像をアップロードしてください。</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#ede9fe' }}>
                  <th style={{ padding: '0.6rem', border: '1px solid #c4b5fd', textAlign: 'left' }}>患者名</th>
                  <th style={{ padding: '0.6rem', border: '1px solid #c4b5fd' }}>モダリティ</th>
                  <th style={{ padding: '0.6rem', border: '1px solid #c4b5fd' }}>撮影日</th>
                  <th style={{ padding: '0.6rem', border: '1px solid #c4b5fd' }}>ステータス</th>
                  <th style={{ padding: '0.6rem', border: '1px solid #c4b5fd', minWidth: '160px' }}>画像 / 操作</th>
                </tr>
              </thead>
              <tbody>
                {studies.filter(s => statusFilter === '全て' || s.status === statusFilter).map(s => (
                  <React.Fragment key={s.study_id}>
                    <tr  style={{ background: inlineStudyId === s.study_id ? '#f5f3ff' : 'white' }}>
                      <td style={{ padding: '0.6rem', border: '1px solid #ede9fe', fontWeight: '500' }}>{s.patient_name}</td>
                      <td style={{ padding: '0.6rem', border: '1px solid #ede9fe', textAlign: 'center' }}>{s.modality}</td>
                      <td style={{ padding: '0.6rem', border: '1px solid #ede9fe', textAlign: 'center', fontSize: '0.88rem' }}>{fmtDate(s.study_date)}</td>
                      <td style={{ padding: '0.6rem', border: '1px solid #ede9fe', textAlign: 'center' }}>
                        {statusBadge(s.status)}
                        {s.status === '未読' && (
                          <button onClick={() => updateStatus(s.study_id, '既読')}
                            style={{ marginLeft: '0.4rem', padding: '0.1rem 0.5rem', fontSize: '0.72rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                            既読に
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '0.6rem', border: '1px solid #ede9fe', textAlign: 'center' }}>
                        {s.jpeg_file && (
                          <img src={`${API_BASE}/images/${s.jpeg_file}`} alt="thumbnail"
                            style={{ width: '52px', height: '52px', objectFit: 'cover', display: 'block', margin: '0 auto 0.3rem', cursor: 'zoom-in', borderRadius: '3px', border: '1px solid #c4b5fd' }}
                            onClick={() => setZoomedImage(`${API_BASE}/images/${s.jpeg_file}`)} />
                        )}
                        <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                          <button onClick={() => openInline(s, 'ai')}
                            style={{ padding: '0.28rem 0.6rem', background: inlineStudyId === s.study_id && inlineMode === 'ai' ? '#5b21b6' : '#7c3aed', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}>
                            🤖 AI診断
                          </button>
                          <button onClick={() => openInline(s, 'report')}
                            style={{ padding: '0.28rem 0.6rem', background: inlineStudyId === s.study_id && inlineMode === 'report' ? '#065f46' : '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}>
                            📝 レポート
                          </button>
                        </div>
                      </td>
                    </tr>
                    {inlineStudyId === s.study_id && inlineMode === 'ai' && (
                      <tr key={`ai-${s.study_id}`}><AiPanel s={s} /></tr>
                    )}
                    {inlineStudyId === s.study_id && inlineMode === 'report' && (
                      <tr key={`report-${s.study_id}`}><ReportPanel s={s} /></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── STEP 4: レポート一覧 ── */}
      <div style={{ marginBottom: '2rem', borderLeft: `4px solid ${STEP_COLORS[4].border}`, paddingLeft: '1rem' }}>
        <StepHeader step={4} title="📋 レポート一覧" />
        {reports.length === 0 ? (
          <p style={{ color: '#94a3b8' }}>レポートがありません。STEP 3 でレポートを作成してください。</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
              <thead>
                <tr style={{ background: '#dcfce7' }}>
                  {['ID', '患者名', '生年月日', '性別', '検査履歴', 'タイムライン', 'がんフラグ', '寛解後', ''].map(h => (
                    <th key={h} style={{ padding: '0.6rem 0.8rem', border: '1px solid #86efac', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id}>
                    <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #e2e8f0', fontWeight: '500' }}>{r.patient_name}</td>
                    <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #e2e8f0', textAlign: 'center' }}>{r.modality}</td>
                    <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #e2e8f0', textAlign: 'center', color: r.ai_result === '正常' ? '#16a34a' : r.ai_result === '未実施' ? '#94a3b8' : '#dc2626', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      {r.ai_result}{r.ai_confidence !== '-' && `（${r.ai_confidence}）`}
                    </td>
                    <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #e2e8f0', fontSize: '0.8rem', maxWidth: '200px' }}>{r.findings}</td>
                    <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #e2e8f0', fontSize: '0.8rem', maxWidth: '160px' }}>{r.conclusion}</td>
                    <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{r.radiologist}</td>
                    <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #e2e8f0', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{r.created_at}</td>
                    <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <button onClick={() => handleExportPDF(r)}
                            style={{ padding: '0.2rem 0.5rem', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', marginRight: '0.3rem' }}>
                            📄 PDF
                        </button>
                        <button onClick={() => handleDeleteReport(r.id)}
                            style={{ padding: '0.2rem 0.5rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}>
                            🗑️ 削除
                        </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 患者一覧（参照パネル）── */}
      <div style={{ marginBottom: '2rem', borderLeft: '4px solid #94a3b8', paddingLeft: '1rem' }}>
        <h2 style={{ color: '#475569', fontSize: '1.1rem', marginBottom: '0.8rem' }}>📁 患者一覧</h2>
        <input
              placeholder="🔍 患者名で検索..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', marginBottom: '0.8rem', width: '250px', fontSize: '0.95rem' }}
        />
        {loading ? <p>読み込み中...</p> : patients.length === 0 ? <p style={{ color: '#94a3b8' }}>患者データがありません</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                {['ID', '患者名', '生年月日', '性別', 'がんフラグ', '検査履歴', 'タイムライン', ''].map(h => (
                  <th key={h} style={{ padding: '0.6rem', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patients
                .filter(p => p.name && p.name.includes(searchQuery))
                .map(p => (
 
                <React.Fragment key={p.id}>
                  <tr>
                    <td style={{ padding: '0.6rem', border: '1px solid #cbd5e1', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>{p.id}</td>
                    <td style={{ padding: '0.6rem', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>{p.name}</td>
                    <td style={{ padding: '0.6rem', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}>{p.birth_date}</td>
                    <td style={{ padding: '0.6rem', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '0.85rem' }}>{p.gender === 'M' ? '男性' : '女性'}</td>
                    <td style={{ padding: '0.6rem', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                      <button onClick={() => togglePatientHistory(p.patient_id)}
                        style={{ padding: '0.3rem 0.7rem', background: expandedPatientId === p.patient_id ? '#64748b' : '#0ea5e9', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem' }}>
                        {expandedPatientId === p.patient_id ? '閉じる' : '🔍 検査を見る'}
                      </button>
                    </td>
                    <td style={{ padding: '0.6rem', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                        <button
                            onClick={() => fetchTimeline(p.patient_id)}
                            style={{ padding: '0.3rem 0.7rem', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem' }}
                        >
                            📅 タイムライン
                        </button>
                    </td>
                    <td style={{ padding: '0.6rem', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                        <button onClick={() => toggleCancerFlag(p.patient_id, p.cancer_flag)}
                            style={{ padding: '0.3rem 0.7rem', background: p.cancer_flag ? '#dc2626' : '#e2e8f0', color: p.cancer_flag ? 'white' : '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}>
                            {p.cancer_flag ? '🔴 がんあり' : '⚪ がんなし'}
                        </button>
                    <td style={{ padding: '0.6rem', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                        <button onClick={() => toggleRemissionMode(p.patient_id, p.remission_mode)}
                            style={{ padding: '0.3rem 0.7rem', background: p.remission_mode ? '#7c3aed' : '#e2e8f0', color: p.remission_mode ? 'white' : '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}>
                            {p.remission_mode ? '🟣 寛解後' : '⚪ 通常'}
                        </button>
                    </td>
                    </td>
                    <td style={{ padding: '0.6rem', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                      <button onClick={() => handleDeletePatient(p.patient_id)}
                        style={{ padding: '0.3rem 0.6rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem' }}>
                        🗑️ 削除
                      </button>
                    </td>
                  </tr>
                  {expandedPatientId === p.patient_id && (
                    <tr key={`hist-${p.id}`}>
                      <td colSpan={6} style={{ background: '#f8fafc', padding: '1rem', border: '1px solid #cbd5e1' }}>
                        <p style={{ fontWeight: 'bold', margin: '0 0 0.6rem', color: '#334155' }}>{p.name} の検査履歴</p>
                        {!patientHistoryCache[p.patient_id] ? <p style={{ color: '#888' }}>読み込み中...</p>
                          : patientHistoryCache[p.patient_id].length === 0 ? <p style={{ color: '#888' }}>検査履歴がありません</p>
                          : (
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                              {patientHistoryCache[p.patient_id].map(s => (
                                <div key={s.study_id} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.8rem', minWidth: '150px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                  {s.jpeg_file ? (
                                    <img src={`${API_BASE}/images/${s.jpeg_file}`} alt="検査"
                                      style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '4px', display: 'block', margin: '0 auto', cursor: 'zoom-in' }}
                                      onClick={() => setZoomedImage(`${API_BASE}/images/${s.jpeg_file}`)} />
                                  ) : (
                                    <div style={{ width: '100px', height: '100px', background: '#e2e8f0', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', color: '#888', fontSize: '0.72rem' }}>
                                      画像なし
                                    </div>
                                  )}
                                  <p style={{ fontSize: '0.75rem', margin: '0.4rem 0 0.1rem', color: '#475569' }}>{fmtDate(s.study_date)}</p>
                                  <p style={{ fontSize: '0.75rem', margin: '0.1rem 0', color: '#475569' }}>{s.modality}</p>
                                  {s.ai_result && (
                                    <p style={{ fontSize: '0.72rem', margin: '0.1rem 0', color: s.ai_result === '正常' ? '#16a34a' : '#dc2626', fontWeight: 'bold' }}>
                                      {s.ai_result}（{s.ai_confidence}）
                                    </p>
                                  )}
                                  <span style={{
                                    display: 'inline-block', fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: '20px', marginTop: '0.3rem',
                                    background: s.status === 'レポート済' ? '#dcfce7' : s.status === 'AI診断済' ? '#fef3c7' : s.status === '既読' ? '#dbeafe' : '#fee2e2',
                                    color: s.status === 'レポート済' ? '#16a34a' : s.status === 'AI診断済' ? '#d97706' : s.status === '既読' ? '#2563eb' : '#dc2626'
                                  }}>{s.status}</span>
                                  <br />
                                  <button onClick={() => selectStudyFromHistory(s)}
                                    style={{ marginTop: '0.5rem', padding: '0.3rem 0.6rem', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>
                                    レポートへ
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}

            </tbody>
          </table>
        )}
      </div>

        {/* グループ比較グラフ */}
        {(() => {
            const [compData, setCompData] = React.useState(null)
            React.useEffect(() => {
                if (!groupComparison) return
                fetch(`${API_BASE}/lifelogs/group-comparison`)
                    .then(r => r.json())
                    .then(d => setCompData(d))
            }, [groupComparison])
            
            if (!compData) return <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '1rem' }}>データ読み込み中...</p>
            
            const chartData = [
                { name: '歩数', がんあり: compData.cancer.steps, がんなし: compData.healthy.steps },
                { name: '睡眠(h)', がんあり: compData.cancer.sleep_hours, がんなし: compData.healthy.sleep_hours },
                { name: '体重(kg)', がんあり: compData.cancer.weight, がんなし: compData.healthy.weight },
            ]
            
            return compData ? (
                <div style={{ marginTop: '1rem' }}>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="がんあり" fill="#dc2626" />
                            <Bar dataKey="がんなし" fill="#16a34a" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            ) : null
        })()}

      {/* ── タイムライン＋生活習慣ログ 横並び ── */}
      {timeline && (
          <div style={{ marginTop: '2rem', display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

              {/* 左：検査タイムライン */}
              <div style={{ flex: '1 1 300px', background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h2 style={{ margin: '0 0 1rem' }}>📅 検査タイムライン</h2>
                    {/* リスクスコア */}
                    {riskScore && riskScore.score !== null && (
                        <div style={{ background: 'white', border: `2px solid ${riskScore.level_color}`, borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.8rem' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 'bold', color: riskScore.level_color }}>{riskScore.score}</p>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>/ 100点</p>
                                </div>
                                <div>
                                    <p style={{ margin: '0 0 0.2rem', fontWeight: 'bold', color: riskScore.level_color, fontSize: '1.1rem' }}>
                                        {riskScore.level}
                                    </p>
                                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.78rem' }}>{riskScore.message}</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {riskScore.details.map((d, i) => (
                                    <div key={i} style={{ background: '#f8fafc', padding: '0.4rem 0.8rem', borderRadius: '4px', border: `1px solid ${d.color}` }}>
                                        <span style={{ color: d.color, fontSize: '0.78rem', fontWeight: 'bold' }}>{d.item}：{d.status}</span>
                                        <span style={{ color: '#64748b', fontSize: '0.75rem', marginLeft: '0.4rem' }}>{d.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {riskScore && riskScore.score === null && (
                        <p style={{ color: '#94a3b8', fontSize: '0.82rem', marginBottom: '1rem' }}>⚠️ {riskScore.message}</p>
                    )}
                    {/* 異常傾向アラート */}
                    {(() => {
                        const alert = detectAlert(timeline.studies)
                        return alert.detected ? (
                            <div style={{ background: '#fee2e2', border: '2px solid #dc2626', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                                <p style={{ color: '#dc2626', fontWeight: 'bold', margin: '0 0 0.3rem', fontSize: '1rem' }}>
                                    ⚠️ 異常傾向を検出！
                                </p>
                                <p style={{ color: '#991b1b', margin: 0, fontSize: '0.88rem' }}>
                                    {alert.from} に正常と診断されましたが、{alert.to} に肺炎と診断されました。早期の対応を推奨します。
                                </p>
                            </div>
                        ) : null
                    })()}
                  <div style={{ borderLeft: '3px solid #94a3b8', paddingLeft: '1.5rem' }}>
                      {timeline.studies.map((s, index) => (
                          <div key={s.study_id} style={{ marginBottom: '1.5rem', position: 'relative' }}>
                              <div style={{
                                  position: 'absolute', left: '-1.9rem', top: '0.3rem',
                                  width: '14px', height: '14px', borderRadius: '50%',
                                  background: s.ai_result === '肺炎' ? '#dc2626' : s.ai_result === '正常' ? '#16a34a' : '#94a3b8'
                              }} />
                              <div style={{
                                  background: 'white', padding: '1rem', borderRadius: '8px',
                                  border: `2px solid ${s.ai_result === '肺炎' ? '#dc2626' : s.ai_result === '正常' ? '#16a34a' : '#e2e8f0'}`
                              }}>
                                  <p style={{ fontWeight: 'bold', margin: '0 0 0.3rem' }}>
                                      #{index + 1} {s.study_date?.split('T')[0]}
                                  </p>
                                  <p style={{ margin: '0.2rem 0', color: '#64748b', fontSize: '0.88rem' }}>
                                      モダリティ：{s.modality} ／ ステータス：{s.status}
                                  </p>
                                  {s.ai_result ? (
                                      <p style={{ margin: 0, color: s.ai_result === '肺炎' ? '#dc2626' : '#16a34a', fontWeight: 'bold' }}>
                                          {s.ai_result === '肺炎' ? '⚠️' : '✅'} AI診断：{s.ai_result}（{s.ai_confidence}）
                                      </p>
                                  ) : (
                                      <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.88rem' }}>AI診断：未実施</p>
                                  )}
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              {/* 右：生活習慣ログ */}
              <div style={{ flex: '1 1 300px', background: '#fefce8', padding: '1.5rem', borderRadius: '8px', border: '1px solid #fde68a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h2 style={{ margin: 0 }}>🏃 生活習慣ログ</h2>
                      <button
                          onClick={() => setShowLifelogForm(!showLifelogForm)}
                          style={{ padding: '0.5rem 1rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
                      >
                          ＋ 記録を追加
                      </button>
                  </div>

                  {showLifelogForm && (
                      <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #fde68a' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              <input type="date" value={lifelogForm.record_date}
                                  onChange={e => setLifelogForm({...lifelogForm, record_date: e.target.value})}
                                  style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <input type="number" placeholder="歩数" value={lifelogForm.steps}
                                      onChange={e => setLifelogForm({...lifelogForm, steps: e.target.value})}
                                      style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', flex: 1 }} />
                                  <input type="number" placeholder="睡眠(h)" value={lifelogForm.sleep_hours}
                                      onChange={e => setLifelogForm({...lifelogForm, sleep_hours: e.target.value})}
                                      style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', flex: 1 }} />
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <select value={lifelogForm.meal}
                                      onChange={e => setLifelogForm({...lifelogForm, meal: e.target.value})}
                                      style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', flex: 1 }}>
                                      <option value="良い">食事：良い</option>
                                      <option value="普通">食事：普通</option>
                                      <option value="悪い">食事：悪い</option>
                                  </select>
                                  <input type="number" placeholder="体重(kg)" value={lifelogForm.weight}
                                      onChange={e => setLifelogForm({...lifelogForm, weight: e.target.value})}
                                      style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', flex: 1 }} />
                              </div>
                              <input placeholder="メモ" value={lifelogForm.memo}
                                  onChange={e => setLifelogForm({...lifelogForm, memo: e.target.value})}
                                  style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                              <button
                                  onClick={() => handleCreateLifelog(timeline.patient_id)}
                                  style={{ padding: '0.5rem', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                  保存
                              </button>
                              {lifelogMessage && <p style={{ color: '#16a34a', margin: 0, fontSize: '0.88rem' }}>{lifelogMessage}</p>}
                          </div>
                      </div>
                  )}

                  {lifelogs.length === 0 ? (
                      <p style={{ color: '#92400e' }}>記録がありません</p>
                  ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {/* グラフ表示 */}
                          {lifelogs.length > 1 && (
                              <div style={{ marginBottom: '1rem' }}>
                                  <p style={{ fontWeight: 'bold', color: '#92400e', margin: '0 0 0.5rem', fontSize: '0.88rem' }}>📈 トレンドグラフ</p>
                                  <ResponsiveContainer width="100%" height={200}>
                                      <LineChart data={lifelogs}>
                                          <CartesianGrid strokeDasharray="3 3" />
                                          <XAxis dataKey="record_date" tick={{ fontSize: 10 }} />
                                          <YAxis tick={{ fontSize: 10 }} />
                                          <Tooltip />
                                          <Legend />
                                          <Line type="monotone" dataKey="steps" stroke="#3b82f6" name="歩数" dot={true} />
                                          <Line type="monotone" dataKey="sleep_hours" stroke="#8b5cf6" name="睡眠(h)" dot={true} />
                                          <Line type="monotone" dataKey="weight" stroke="#f59e0b" name="体重(kg)" dot={true} />
                                      </LineChart>
                                  </ResponsiveContainer>
                              </div>
                          )}
                          {lifelogs.map(l => (
                              <div key={l.id} style={{ background: 'white', padding: '0.8rem', borderRadius: '6px', border: '1px solid #fde68a' }}>
                                  <p style={{ fontWeight: 'bold', margin: '0 0 0.3rem', color: '#92400e' }}>{l.record_date}</p>
                                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.85rem', color: '#64748b' }}>
                                      <span>👟 {l.steps}歩</span>
                                      <span>😴 {l.sleep_hours}h</span>
                                      <span style={{ color: l.meal === '良い' ? '#16a34a' : l.meal === '悪い' ? '#dc2626' : '#64748b' }}>
                                          🍽️ {l.meal}
                                      </span>
                                      <span>⚖️ {l.weight}kg</span>
                                      {l.memo && <span>📝 {l.memo}</span>}
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          </div>
      )}
    
    </div>
  )
}

export default App
