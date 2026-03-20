import { Typography } from 'antd';

const { Title, Text } = Typography;

export function HomePage() {
  return (
    <div className="p-6 animate-in fade-in-50 duration-200">
      <Title level={4}>欢迎</Title>
      <Text type="secondary">SwellLobster 首页</Text>
    </div>
  );
}
