import React from 'react';
import { Text, TextProps, StyleProp, TextStyle } from 'react-native';

interface TypographyProps extends TextProps {
    children?: React.ReactNode;
    style?: StyleProp<TextStyle>;
}

const Typography: React.FC<TypographyProps> = ({ children, style, ...rest }) => {
    return (
        <Text style={style} {...rest}>
            {children}
        </Text>
    );
};

export default Typography;
