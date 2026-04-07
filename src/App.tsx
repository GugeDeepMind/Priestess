import { useState } from 'react'
import { ParadigmSelect } from './pages/ParadigmSelect'
import { Chat } from './pages/Chat'
import { KnowledgeGraphPage } from './pages/KnowledgeGraph'
import './styles.css'

type Page = 'paradigm' | 'chat' | 'knowledge-graph'

export default function App() {
  const [page, setPage] = useState<Page>('paradigm')
  const [selectedParadigm, setSelectedParadigm] = useState<string | null>(null)

  const handleParadigmSelect = (name: string) => {
    setSelectedParadigm(name)
    setPage('chat')
  }

  switch (page) {
    case 'paradigm':
      return <ParadigmSelect onSelect={handleParadigmSelect} />
    case 'chat':
      return (
        <Chat
          paradigm={selectedParadigm!}
          onBack={() => setPage('paradigm')}
          onOpenKnowledgeGraph={() => setPage('knowledge-graph')}
        />
      )
    case 'knowledge-graph':
      return <KnowledgeGraphPage onBack={() => setPage('chat')} />
  }
}
