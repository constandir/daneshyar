import { render } from 'preact';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/700.css';
import './styles.css';
import { App } from './App';

render(<App />, document.getElementById('app')!);
