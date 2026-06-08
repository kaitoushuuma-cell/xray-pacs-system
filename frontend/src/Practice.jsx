import {useEffect, useState} from "react"

function Practice(){
    const [name, setName] = useState("")
    const [birthdate, setBirthdate] = useState("")
    const [gender, setGender] = useState("M")
    const [studies , setStudies] = useState([])

    const fetchStudies = async() => {
        const res = await fetch("http://localhost:8000/studies")
        const data =await res.json()
        setStudies(data)
    }
    useEffect(() =>{
        fetchStudies()
    },[])

    const handleSubmit = async () => {
        const patient_id = Date.now().toString()
        const params = new URLSearchParams({
            patient_id,
            name,
            birth_date: birthdate,
            gender
        })
        await fetch(`http://localhost:8000/patients?${params}`, {
            method: "POST",
        })
        setName("")
        setBirthdate("")
        setGender("M")
        fetchStudies()  // ← これを追加
    }
    return(
        <div>
            <h2>患者登録</h2>
            <input
                placeholder="患者名"
                value={name}
                onChange={e => setName(e.target.value)}
            />
            <input
                type="date"
                value={birthdate}
                onChange={e => setBirthdate(e.target.value)}
            />
            <select
                value={gender}
                onChange={e => setGender(e.target.value)}
            >
                <option value="M">男性</option>
                <option value="F">女性</option>
            </select>
            <button onClick={handleSubmit}>登録する</button>

            <h2>検査一覧</h2>
            <table>
                <thead>
                    <tr>
                        <th>患者名</th>
                        <th>モダリティ</th>
                        <th>撮影日</th>
                        <th>ステータス</th>
                    </tr>
                </thead>
                <tbody>
                    {studies.map(s => (
                      <tr key={s.study_id}>
                        <td>{s.patient_name}</td>
                        <td>{s.modality}</td>
                        <td>{s.study_date}</td>
                        <td>{s.status}</td>
                      </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
export default Practice